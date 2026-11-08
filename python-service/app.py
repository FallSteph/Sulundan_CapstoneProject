import re
import io
import logging
import pandas as pd
from typing import List, Dict, Tuple

from fastapi import FastAPI, HTTPException, File, UploadFile
from docx import Document
from docx.table import Table, _Cell

from docx.oxml.ns import qn, nsmap

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, nsmap
import os

# Add namespaces for watermarking
nsmap['v'] = 'urn:schemas-microsoft-com:vml'
nsmap['o'] = 'urn:schemas-microsoft-com:office:office'
nsmap['w10'] = 'urn:schemas-microsoft-com:office:word'

from pydantic import BaseModel
import re as _re

class SignatureRequest(BaseModel):
    file_path: str
    signature_path: str
    search_text: str
    doc_type: str = "syllabus"
    align: str = "center"

class ExtractCommentsRequest(BaseModel):
    file_path: str

app = FastAPI(title="Syllabus Table Analyzer (Final)")

# ---------------------------------------------------------------------------
# Path normalization: The Node.js backend may send Windows absolute paths like
# C:\Users\...\Shared\backend\uploads\... when running natively on Windows,
# but this Python service runs inside Docker where the backend folder is
# mounted at /backend. This helper converts those Windows paths so Docker can
# find the file.
# ---------------------------------------------------------------------------
def normalize_path(file_path: str) -> str:
    """Convert paths between Docker (/backend/...) and native OS filesystem environments."""
    if not file_path:
        return file_path
        
    normalized = file_path.replace("\\", "/")
    match = _re.search(r'[Bb]ackend/(.*)', normalized)
    
    # 1. If running in Docker container and /backend/... path exists
    if match:
        docker_path = "/backend/" + match.group(1)
        if os.path.exists(docker_path):
            return docker_path
            
    # 2. Check if the raw input path exists directly
    if os.path.exists(file_path):
        return file_path

    # 3. Check relative path on host system (replacing / with OS separator)
    if match:
        rel_sys = match.group(1).replace("/", os.sep)
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        host_path = os.path.join(base_dir, "backend", rel_sys)
        if os.path.exists(host_path):
            return host_path
            
        cwd_path = os.path.abspath(os.path.join("..", "backend", rel_sys))
        if os.path.exists(cwd_path):
            return cwd_path

    # 4. Search by filename fallback in uploads/syllabi, uploads/forms, signatures, etc.
    fname = os.path.basename(normalized)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for folder in ["uploads/syllabi", "uploads/forms", "uploads", "signatures"]:
        candidate = os.path.join(base_dir, "backend", folder.replace("/", os.sep), fname)
        if os.path.exists(candidate):
            return candidate

    return file_path


# ---------------------------------------------------
# REVIEW GUIDE KEYWORD MAP (Form 18 / CITL Syllabus Review Legend Part B)
# ---------------------------------------------------
REVIEW_KEYWORD_MAP = [
    # A. Format and House Style
    {"code": "A.1. format", "keywords": ["format", "template", "template prescribed", "prescribed template", "paper size", "a4", "orientation", "landscape", "margin", "layout"]},
    {"code": "A.2. structure", "keywords": ["structure", "logical sections", "section", "arrangement", "layout", "organization", "arrange"]},
    {"code": "A.3. font style use", "keywords": ["font style", "book antiqua", "typeface", "font face", "font type", "font"]},
    {"code": "A.4. font size use", "keywords": ["font size", "heading", "12pt", "12 pt", "11pt", "11 pt", "9pt", "9 pt", "point size"]},
    {"code": "A.5. line spacing (single)", "keywords": ["line spacing", "spacing", "single spacing", "double spacing"]},
    # B. Alignment
    {"code": "B.1. coherence and logical connection between CO and SLO", "keywords": [
        "co and slo", "co to slo", "course outcome and specific learning", "slo and co", "aligned with slo",
        "co-slo", "coherence", "connection between co", "co1", "co2", "co3", "co4", "co5", "co6",
        "misalign", "misalignment", "co ug", "co og", "co and", "slo", "alignment", "align"
    ]},
    {"code": "B.2. coherence and logical connection between CO and PAO", "keywords": [
        "co and pao", "co to pao", "performance assessment output", "pao", "assessment output", "performance task"
    ]},
    {"code": "B.3. coherence and logical connection between CO and IAS", "keywords": [
        "co and ias", "co to ias", "innovative approach", "ias", "strategy", "teaching strategy"
    ]},
    {"code": "B.4. coherence and logical connection between CO and ICT", "keywords": [
        "co and ict", "ict tools", "technology", "tools and resources", "ict", "digital tool", "software", "application"
    ]},
    {"code": "B.5. coherence and logical connection between SLO and IAS", "keywords": [
        "slo and ias", "slo to ias", "specific learning outcome and approach"
    ]},
    {"code": "B.6. coherence and logical connection between SLO and ICT", "keywords": [
        "slo and ict", "slo to ict", "specific learning outcome and ict"
    ]},
    # C. Use of Behavioral Verbs
    {"code": "C.1. use of action/behavioral verb/s in course outcome/s", "keywords": [
        "behavioral verb", "action verb", "course outcome verb", "bloom", "active verb", "measurable verb",
        "co verb", "verb in co", "verb for co", "taxonomy", "blooms"
    ]},
    {"code": "C.2. use of action/behavioral verb/s in specific learning outcome/s", "keywords": [
        "slo verb", "specific learning outcome verb", "learning outcome verb", "observable",
        "precise verb", "measurable slo", "verb in slo", "verb for slo"
    ]},
    # D. Gradation of COs and SLOs
    {"code": "D.1. hierarchical COs", "keywords": ["hierarchical co", "hierarchy of co", "complexity", "increasing level", "arranged co", "gradation", "co order", "order of co"]},
    {"code": "D.2. overarching COs", "keywords": ["overarching co", "overarching course outcome", "broad co", "encompassing"]},
    {"code": "D.3. foundational SLO", "keywords": ["foundational slo", "foundational specific learning", "basic slo", "foundation"]},
    {"code": "D.4. mediating SLO", "keywords": ["mediating slo", "mediating specific learning", "intermediate slo", "mediating"]},
    {"code": "D.5. terminal/ultimate SLO", "keywords": ["terminal slo", "ultimate slo", "terminal specific learning", "final slo", "culminating slo"]},
    # E. Supplementary Documentation
    {"code": "E.1. Revision History", "keywords": ["revision history", "revisions", "history of revision", "previous revision", "revision date"]},
    {"code": "E.2. Signatories", "keywords": ["signatories", "signatory", "signature", "proper signatories", "faculty head", "vpaa", "department head", "dean", "citl director"]},
    {"code": "E.3. Name/s of Syllabus Author(s)", "keywords": ["author", "syllabus author", "name of author", "authored by"]},
    {"code": "E.4. Reference List", "keywords": ["reference list", "references", "apa", "apa 7", "bibliography", "reference format", "citation", "reference"]},
    # F. Inclusion of Prescribed Institutional Forms
    {"code": "F.1. Form 17 (Review Checklist)", "keywords": ["form 17", "review checklist", "form17", "checklist"]},
    {"code": "F.2. Form 18-1 (Syllabus Review Suggestion and Action Taken)", "keywords": ["form 18", "form18", "syllabus review suggestion", "action taken", "suggestion"]},
    {"code": "F.3. Justification Form", "keywords": ["justification", "justification form", "no affixed signature", "no signature affixed"]},
]

def classify_comment(text: str) -> str:
    """
    Keyword-based classification of a comment text against the Form 18 review guide codes.
    Returns the matching code string or empty string if no match.
    Uses multi-word phrase matching first, then falls back to individual word matching.
    """
    lower = text.lower()
    best_code = ""
    best_count = 0
    for entry in REVIEW_KEYWORD_MAP:
        count = 0
        for kw in entry["keywords"]:
            if len(kw) <= 3:
                # For very short keywords (like "co", "ict", "slo"), require word-boundary style matching
                import re as _re2
                if _re2.search(r'\b' + _re2.escape(kw) + r'\b', lower):
                    count += 1
            elif kw in lower:
                count += 1
        if count > best_count:
            best_count = count
            best_code = entry["code"]
    return best_code if best_count > 0 else ""



def set_image_behind_text(run, picture):
    """
    HACK: Modify the underlying XML to set the image wrapping to 'Behind Text'.
    Uses 'anchor' instead of 'inline' for floating positioning.
    """
    inline = picture._inline
    extent = inline.extent
    docPr = inline.docPr
    graphic = inline.graphic
    
    # Define anchor XML with behind-text wrapping
    # Using relativeFrom="paragraph" and align="center" for horizontal
    # Using relativeFrom="paragraph" and posOffset for vertical. 
    # A negative posOffset moves the image UP from the paragraph baseline.
    # -150000 is approximately 0.15 inches up.
    anchor_xml = (
        f'<wp:anchor {nsdecls("wp", "a", "pic", "r")}'
        ' distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251658240" '
        'behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">'
        '<wp:simplePos x="0" y="0"/>'
        '<wp:positionH relativeFrom="paragraph"><wp:align>center</wp:align></wp:positionH>'
        '<wp:positionV relativeFrom="paragraph"><wp:posOffset>-150000</wp:posOffset></wp:positionV>'
        f'<wp:extent cx="{extent.cx}" cy="{extent.cy}"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        '<wp:wrapNone/>'
        f'{docPr.xml}'
        f'{graphic.xml}'
        '</wp:anchor>'
    )
    
    anchor = parse_xml(anchor_xml)
    inline.getparent().replace(inline, anchor)

def clean_search_text(text):
    """Normalize text for fuzzy matching."""
    return re.sub(r"\s+", " ", text.strip().lower())

# ---------------------------------------------------
# EXTRACT COMMENTS FROM DOCX
# ---------------------------------------------------
@app.post("/extract-comments")
async def extract_comments(req: ExtractCommentsRequest):
    """
    Extract all reviewer comments from a .docx file and classify each
    against the Form 18 Review Guide using keyword matching.
    Returns a list of {author, comment, reviewCode, pageNumber} dicts.
    """
    req.file_path = normalize_path(req.file_path)
    if not os.path.exists(req.file_path):
        raise HTTPException(404, f"File not found: {req.file_path}")
    try:
        import zipfile
        from lxml import etree
        
        results = []
        comment_pages = {}
        
        with zipfile.ZipFile(req.file_path, 'r') as z:
            # 1. Parse document.xml to map comment IDs to estimated page numbers
            if 'word/document.xml' in z.namelist():
                doc_bytes = z.read('word/document.xml')
                doc_root = etree.fromstring(doc_bytes)
                page_num = 1
                for el in doc_root.iter():
                    tag = el.tag.split('}')[-1]
                    if tag == 'lastRenderedPageBreak':
                        page_num += 1
                    elif tag == 'br' and el.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}type') == 'page':
                        page_num += 1
                    elif tag == 'commentRangeStart' or tag == 'commentReference':
                        c_id = el.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
                        if c_id and c_id not in comment_pages:
                            comment_pages[c_id] = page_num
                            
            # 2. Parse comments.xml to extract comment text and author
            if 'word/comments.xml' in z.namelist():
                xml_bytes = z.read('word/comments.xml')
                root = etree.fromstring(xml_bytes)
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                for comment_el in root.findall('.//w:comment', ns):
                    c_id = comment_el.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
                    author = comment_el.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}author', '')
                    texts = []
                    for t in comment_el.findall('.//w:t', ns):
                        if t.text:
                            texts.append(t.text)
                    comment_text = ' '.join(texts).strip()
                    if not comment_text:
                        continue
                    review_code = classify_comment(comment_text)
                    results.append({
                        "author": author,
                        "comment": comment_text,
                        "reviewCode": review_code,
                        "pageNumber": str(comment_pages.get(c_id, ''))
                    })

        return {"success": True, "comments": results}
    except Exception as e:
        logger.error(f"extract-comments failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))

# ---------------------------------------------------
# SIGNATURE INSERTION
# ---------------------------------------------------
@app.post("/insert-signature")
async def insert_signature(req: SignatureRequest):
    """
    Find search_text in the document and insert the signature image above it.
    """
    req.file_path = normalize_path(req.file_path)
    req.signature_path = normalize_path(req.signature_path)
    
    import time
    for _ in range(10):
        if os.path.exists(req.file_path) and os.path.exists(req.signature_path):
            break
        time.sleep(0.5)
        
    if not os.path.exists(req.file_path):
        logger.error(f"File not found: {req.file_path}")
        raise HTTPException(404, f"File not found: {req.file_path}")
    if not os.path.exists(req.signature_path):
        logger.error(f"Signature not found: {req.signature_path}")
        raise HTTPException(404, f"Signature not found: {req.signature_path}")

    try:
        doc = Document(req.file_path)
        found = False
        target_clean = clean_search_text(req.search_text)
        logger.info(f">>> SIGNATURE REQUEST: '{target_clean}' in {req.file_path}")

        def apply_sig(para, sig_path, label="unknown", in_table=True):
            logger.info(f"Applying signature to para: '{para.text[:30]}' (Source: {label}, in_table: {in_table})")
            try:
                # FIRST: Scorched-earth scrub of any existing images in the target area!
                try:
                    target_container = None
                    if in_table:
                        parent = para._element.getparent()
                        from docx.oxml.ns import qn
                        while parent is not None and parent.tag != qn('w:tc'):
                            parent = parent.getparent()
                        if parent is not None:
                            target_container = parent
                    else:
                        target_container = para._element

                    if target_container is not None:
                        # Find and destroy all drawing, pict, and AlternateContent nodes 
                        # to eradicate OnlyOffice's VML fallbacks completely!
                        for tag_name in ['drawing', 'pict', 'AlternateContent']:
                            for node in target_container.xpath(f'.//*[local-name()="{tag_name}"]'):
                                if node.getparent() is not None:
                                    node.getparent().remove(node)
                except Exception as clear_err:
                    logger.warning(f"Failed to clear existing signatures: {clear_err}")

                # Attach to the run containing the text for precise horizontal anchoring
                target_run = None
                for r in para.runs:
                    if any(v in clean_search_text(r.text) for v in active_variants):
                        target_run = r
                        break
                
                run = target_run if target_run else (para.runs[0] if para.runs else para.add_run())
                
                picture = run.add_picture(sig_path, width=Inches(1.9))
                
                # IMPORTANT: Move the drawing XML element to the start of the run 
                # so the character anchor is at the FRONT of the text, preventing word wrap overflow bugs!
                drawing_elements = run._element.xpath('.//w:drawing')
                if drawing_elements:
                    run._element.insert(0, drawing_elements[0])
                
                set_image_behind_text_v2(run, picture, in_table)
                logger.info("Signature applied with behind-text wrapping.")
                return True
            except Exception as ex:
                logger.error(f"Signature insertion failed: {ex}")
                return False

        def set_image_behind_text_v2(run, picture, in_table=True):
            inline = picture._inline
            extent = inline.extent
            docPr = inline.docPr
            graphic = inline.graphic
            docPr_xml = docPr.xml
            
            # Identify this image as a signature so it can be programmatically removed if needed
            docPr_xml = re.sub(r'name="[^"]*"', 'name="Syllabus_Signature"', docPr_xml)
            docPr_xml = re.sub(r'descr="[^"]*"', 'descr="Digital Signature Block"', docPr_xml)
            if 'descr=' not in docPr_xml:
                docPr_xml = docPr_xml.replace('name="Syllabus_Signature"', 'name="Syllabus_Signature" descr="Digital Signature Block"')

            if in_table:
                # In tables, the anchor is the FIRST paragraph ("Prepared by...").
                # We use a 0 offset so the top of the signature aligns with the top of the cell,
                # which makes it nicely centered vertically over the name since the signature covers the cell height.
                offset_emu = 0
                h_pos = '<wp:positionH relativeFrom="column"><wp:align>center</wp:align></wp:positionH>'
            else:
                # For form paragraphs, shift up a bit more since there's no
                # table cell boundary to worry about.
                offset_emu = -int(extent.cy * 0.85)
                
                # Use character-relative positioning for forms so it always
                # aligns precisely over the target text, regardless of indents.
                # Offset by ~0.2 inches (182880 EMU) to the right to center it slightly over the text
                h_pos = '<wp:positionH relativeFrom="character"><wp:posOffset>182880</wp:posOffset></wp:positionH>'

            anchor_xml = (
                f'<wp:anchor {nsdecls("wp", "a", "pic", "r")}'
                ' distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251658240" '
                'behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">'
                '<wp:simplePos x="0" y="0"/>'
                f'{h_pos}'
                f'<wp:positionV relativeFrom="paragraph"><wp:posOffset>{offset_emu}</wp:posOffset></wp:positionV>'
                f'<wp:extent cx="{extent.cx}" cy="{extent.cy}"/>'
                '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
                '<wp:wrapNone/>'
                f'{docPr_xml}'
                f'{graphic.xml}'
                '</wp:anchor>'
            )
            anchor = parse_xml(anchor_xml)
            inline.getparent().replace(inline, anchor)

        def is_real_name(text):
            t = clean_search_text(text)
            if not t or len(t) < 3: return False
            # Exclude roles
            if any(r in t for r in ["dean", "head", "director", "vpaa", "faculty", "vpa", "coordinator", "instructor", "vppqa", "admin"]):
                return False
            # Exclude labels
            if any(l in t for l in ["prepared", "reviewed", "approved", "revised", "date", "by:", "by :"]):
                return False
            # Exclude lines
            if re.match(r'^[\s\_\-\.\~\/]+$', text): return False
            return True

        # Role mapping for strict matching
        role_variants = {
            "dept_head": ["department head", "dept. head", "dept head", "chairperson", "program chair", "program head", "program coordinator", "department chair", "reviewed by"],
            "dean": ["college dean", "dean", "dean of"],
            "citl": ["citl director", "director, citl", "citl", "fdis chair"],
            "vpaa": ["vice president for academic affairs", "vpaa", "vp for academic affairs", "approved by"],
            "lead_faculty": ["lead faculty", "prepared by", "prepared by/date", "faculty member", "course faculty"],
            "course_instructor": ["course instructor", "revised by", "revised by/date", "instructor"]
        }
        
        # Determine which role we are looking for based on target_clean
        active_set = set([target_clean])
        matched_role_key = None
        for role_key, variants in role_variants.items():
            if any(target_clean == v for v in variants):
                active_set.update(variants)
                matched_role_key = role_key
                break
            if any(v in target_clean for v in variants):
                active_set.update(variants)
                matched_role_key = role_key
                break
        active_set.add(target_clean.replace("/", " "))

        if matched_role_key == "citl":
            if any(v in target_clean for v in ["citl director", "director, citl"]):
                active_set.discard("citl")
                active_set.discard("fdis chair")
            elif "fdis chair" in target_clean:
                active_set.discard("citl")
                active_set.discard("citl director")
                active_set.discard("director, citl")

        active_variants = list(active_set)
        
        logger.info(f"Target variants: {active_variants}")
        
        found = False
        target_para = None
        in_table = False

        def search_tables(reverse=False):
            nonlocal found, target_para, in_table
            tables = list(doc.tables)
            if reverse: tables.reverse()
            for table_idx, table in enumerate(tables):
                rows = list(table.rows)
                if reverse: rows.reverse()
                for r_idx, row in enumerate(rows):
                    for c_idx, cell in enumerate(row.cells):
                        cell_text = clean_search_text(cell.text)
                        if any(v in cell_text for v in active_variants):
                            logger.info(f"Found role '{cell_text}' in Table {table_idx}, Row {r_idx}, Col {c_idx}")
                            role_para_idx = -1
                            
                            for p_idx, p in enumerate(cell.paragraphs):
                                p_clean = clean_search_text(p.text)
                                if any(v in p_clean for v in active_variants):
                                    role_para_idx = p_idx
                                    break
                            
                            if role_para_idx == 0:
                                p_clean = clean_search_text(cell.paragraphs[0].text)
                                is_only_role = False
                                for v in active_variants:
                                    if p_clean == v:
                                        is_only_role = True
                                        break
                                
                                if is_only_role and r_idx > 0:
                                    try:
                                        cell_above = table.cell(r_idx - 1, c_idx)
                                        for p in reversed(cell_above.paragraphs):
                                            if p.text.strip() != "":
                                                target_para = p
                                                break
                                        if target_para is None:
                                            target_para = cell_above.paragraphs[-1]
                                    except Exception:
                                        target_para = cell.paragraphs[0]
                                else:
                                    for p in cell.paragraphs:
                                        if p.text.strip() != "":
                                            target_para = p
                                            break
                                    if target_para is None:
                                        target_para = cell.paragraphs[0]
                            else:
                                for p in cell.paragraphs:
                                    if p.text.strip() != "":
                                        target_para = p
                                        break
                                if target_para is None:
                                    target_para = cell.paragraphs[0]
                            
                            if target_para is not None:
                                found = apply_sig(target_para, req.signature_path, f"table_cell_match_r{r_idx}", True)
                                break
                    if found: break
                if found: break

        def search_paragraphs(reverse=True):
            nonlocal found, target_para, in_table
            search_range = range(len(doc.paragraphs) - 1, -1, -1) if reverse else range(len(doc.paragraphs))
            
            for i in search_range:
                para = doc.paragraphs[i]
                p_text = clean_search_text(para.text)
                
                if len(p_text) > 80:
                    continue
                
                if any(k in p_text for k in ["legend", "instruction", "signatories", "proper signatories", "justification"]):
                    continue
                
                matched = False
                for v in active_variants:
                    if v in p_text:
                        matched = True
                        break
                
                if matched:
                    logger.info(f"Found role '{p_text}' in paragraph {i}")
                    found = apply_sig(para, req.signature_path, f"para_match_i{i}", False)
                    break

        if req.doc_type == "form18":
            search_tables(reverse=True)
            if not found:
                search_paragraphs(reverse=True)
        elif req.doc_type == "form17":
            search_paragraphs(reverse=True)
            if not found:
                search_tables(reverse=True)
        else:
            # Syllabus: Lead Faculty searches top-down (reverse=False) to hit "Prepared by / Lead Faculty" first
            is_lead = matched_role_key == "lead_faculty" or "lead" in target_clean or "prepared" in target_clean
            search_tables(reverse=not is_lead)
            if not found:
                search_paragraphs(reverse=not is_lead)

        if not found:
            logger.warning(f"Target '{target_clean}' NOT FOUND. Returning False without appending to end.")
            return {"success": False, "found": False, "error": "Specified role space not found in document"}


        doc.save(req.file_path)
        return {"success": True, "found": found}
    except Exception as e:
        logger.error(f"Insertion failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))

class RemoveSignatureRequest(BaseModel):
    file_path: str

@app.post("/remove-signatures")
async def remove_signatures(req: RemoveSignatureRequest):
    """
    Scan the document for any drawings tagged as 'Syllabus_Signature' and remove them.
    Used to generate an 'unsigned' version of the final doc.
    """
    req.file_path = normalize_path(req.file_path)
    if not os.path.exists(req.file_path):
        raise HTTPException(404, f"File not found: {req.file_path}")

    try:
        doc = Document(req.file_path)
        removed_count = 0

        def scrub_para(p):
            nonlocal removed_count
            try:
                # Target all possible image containers OnlyOffice might use
                for tag in ['drawing', 'pict', 'AlternateContent']:
                    for node in p._element.xpath(f'.//*[local-name()="{tag}"]'):
                        try:
                            # Primary check: Our custom rel_height signature marker
                            anchors = node.xpath('.//*[local-name()="anchor"]')
                            rel_height = anchors[0].get('relativeHeight') if anchors else None
                            
                            # Secondary check: Standard metadata names (which OnlyOffice might strip)
                            docPrs = node.xpath('.//*[local-name()="docPr"]')
                            name = docPrs[0].get('name', '') if docPrs else ""
                            descr = docPrs[0].get('descr', '') if docPrs else ""

                            is_signature = (
                                rel_height == "251658240" or
                                name == "Syllabus_Signature" or 
                                name.startswith("sig_") or
                                descr == "Digital Signature Block"
                            )

                            if is_signature:
                                parent = node.getparent()
                                if parent is not None:
                                    parent.remove(node)
                                    removed_count += 1
                        except Exception as node_err:
                            logger.warning(f"Error checking node in scrub: {node_err}")
                
            except Exception as para_err:
                logger.warning(f"Error processing a paragraph: {para_err}")

        # Check main paragraphs
        for p in doc.paragraphs:
            scrub_para(p)

        # Check and scrub within tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        scrub_para(p)

        if removed_count > 0:
            doc.save(req.file_path)
            logger.info(f"Removed {removed_count} signatures from {req.file_path}")
        
        return {"success": True, "removed_count": removed_count}
    except Exception as e:
        logger.error(f"Removal failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))

class WatermarkRequest(BaseModel):
    file_path: str
    text: str = "DRAFT"

@app.post("/add-watermark")
async def add_watermark(req: WatermarkRequest):
    """
    Insert a diagonal background watermark into the document headers.
    """
    req.file_path = normalize_path(req.file_path)
    if not os.path.exists(req.file_path):
        raise HTTPException(404, f"File not found: {req.file_path}")

    try:
        doc = Document(req.file_path)
        added_count = 0
        
        for section in doc.sections:
            header = section.header
            para = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
            run = para.add_run()
            
            # Word VML watermark XML
            vml = f"""
            <w:pict {nsdecls('w', 'v', 'o')}>
                <v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e">
                    <v:formulas>
                        <v:f eqn="sum #0 0 10800"/>
                        <v:f eqn="prod #0 2 1"/>
                        <v:f eqn="sum 21600 0 @1"/>
                        <v:f eqn="sum 0 0 @2"/>
                        <v:f eqn="sum 21600 0 @3"/>
                        <v:f eqn="if @0 @3 0"/>
                        <v:f eqn="if @0 21600 @1"/>
                        <v:f eqn="if @0 0 @2"/>
                        <v:f eqn="if @0 @4 21600"/>
                        <v:f eqn="mid @5 @6"/>
                        <v:f eqn="mid @8 @5"/>
                        <v:f eqn="mid @7 @8"/>
                        <v:f eqn="mid @6 @7"/>
                        <v:f eqn="sum @6 0 @5"/>
                    </v:formulas>
                    <v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>
                    <v:textpath on="t" fitshape="t"/>
                    <v:handles>
                        <v:h position="#0,bottomRight" xrange="6629,14971"/>
                    </v:handles>
                    <o:lock v:ext="edit" text="t" shapetype="t"/>
                </v:shapetype>
                <v:shape id="Syllabus_Watermark" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;left:0;text-align:left;margin-left:0;margin-top:0;width:415.2pt;height:249.1pt;rotation:315;z-index:-251657216;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f">
                    <v:fill opacity=".3"/>
                    <v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="{req.text}"/>
                </v:shape>
            </w:pict>
            """
            run._r.append(parse_xml(vml))
            added_count += 1
            
        if added_count > 0:
            doc.save(req.file_path)
            logger.info(f"Added watermark to {added_count} sections in {req.file_path}")
            
        return {"success": True, "added_count": added_count}
    except Exception as e:
        logger.error(f"Watermark addition failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))

@app.post("/remove-watermark")
async def remove_watermark(req: WatermarkRequest):
    """
    Remove the background watermark from the document.
    """
    req.file_path = normalize_path(req.file_path)
    if not os.path.exists(req.file_path):
        raise HTTPException(404, f"File not found: {req.file_path}")

    try:
        doc = Document(req.file_path)
        removed_count = 0
        
        for section in doc.sections:
            header = section.header
            for para in header.paragraphs:
                # Find the pict elements with our specific watermark shape
                for tag in ['pict', 'drawing', 'AlternateContent']:
                    for node in para._element.xpath(f'.//*[local-name()="{tag}"]'):
                        is_watermark = False
                        
                        # Look for our custom watermark ID
                        shapes = node.xpath('.//*[local-name()="shape"]')
                        for shape in shapes:
                            if shape.get('id') == "Syllabus_Watermark":
                                is_watermark = True
                                break
                                
                        # Also look for any shape with textpath string containing DRAFT 
                        if not is_watermark:
                            textpaths = node.xpath('.//*[local-name()="textpath"]')
                            for tp in textpaths:
                                if "DRAFT" in str(tp.get('string', '')).upper():
                                    is_watermark = True
                                    break
                                    
                        # Robust fallback: check if the node's XML string contains our watermark ID or "DRAFT"
                        if not is_watermark:
                            try:
                                from lxml import etree
                                node_xml = etree.tostring(node, encoding='unicode').upper()
                                if "SYLLABUS_WATERMARK" in node_xml or "DRAFT" in node_xml:
                                    is_watermark = True
                            except Exception:
                                pass
                        
                        if is_watermark:
                            parent = node.getparent()
                            if parent is not None:
                                parent.remove(node)
                                removed_count += 1
        
        if removed_count > 0:
            doc.save(req.file_path)
            logger.info(f"Removed {removed_count} watermarks from {req.file_path}")
            
        return {"success": True, "removed_count": removed_count}
    except Exception as e:
        logger.error(f"Watermark removal failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@app.post("/analyze-table")
async def analyze_table(file: UploadFile = File(...)):
    """
    Analyze the syllabus learning plan table, count empty cells per column, split into pre-midterm and pre-final sections.
    """
    try:
        file_bytes = await file.read()
        logger.info(f"Analyzing table from uploaded file: {file.filename}")
        result = analyze_syllabus_table(file_bytes)
        logger.info(f"Table analysis completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Table analysis failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ---------------------------------------------------
# EXPECTED HEADERS (for scoring)
# ---------------------------------------------------
EXPECTED_HEADERS = [
    'week',
    'course outcomes',
    'specific learning outcomes',
    'slo',
    'topic',
    'topics',
    'lessons',
    'learning activities',
    'class activities',
    'innovative approaches and strategies',
    'ict',
    'technology',
    'required readings',
    'resources',
    'reference',
    'assessment',
    'outputs',
    'teacher',
    'instructor',
    'time',
    'hours'
]

# Regex for separator and orientation rows
RE_SEP_MIDTERM = re.compile(r"\bmid[\s-]?term\b.*\bexam(?:ination)?\b", re.IGNORECASE)
RE_SEP_FINAL = re.compile(r"\bfinal\b.*\bexam(?:ination)?\b", re.IGNORECASE)
RE_ORIENTATION = re.compile(r"\buniversity[\s-]?wide\b.*student.*orientation", re.IGNORECASE)

# ---------------------------------------------------
# TABLE TO MATRIX (expands merged cells)
# ---------------------------------------------------
def table_to_matrix(table: Table) -> List[List[str]]:
    """Convert a word table to a matrix with merged cells expanded correctly."""
    if not table.rows:
        return []

    # Detect redundant grid columns where cell._tc is identical to previous column across ALL rows
    num_grid_cols = len(table.columns) if table.columns else (len(table.rows[0].cells) if table.rows else 0)
    cols_to_keep = []
    if num_grid_cols > 0:
        cols_to_keep.append(0)
        for col_idx in range(1, num_grid_cols):
            is_duplicate_grid_col = True
            for row in table.rows:
                if col_idx >= len(row.cells) or (col_idx - 1) >= len(row.cells):
                    is_duplicate_grid_col = False
                    break
                if row.cells[col_idx]._tc != row.cells[col_idx - 1]._tc:
                    is_duplicate_grid_col = False
                    break
            if not is_duplicate_grid_col:
                cols_to_keep.append(col_idx)
    else:
        cols_to_keep = list(range(len(table.rows[0].cells))) if table.rows else []

    matrix = []
    
    # Track the last text seen in a 'restart' cell for each physical column
    last_vmerge_text = {}

    for row_idx, row in enumerate(table.rows):
        row_cells = []
        for out_idx, col_idx in enumerate(cols_to_keep):
            if col_idx >= len(row.cells):
                row_cells.append("")
                continue
            cell = row.cells[col_idx]
            tcPr = cell._tc.tcPr
            vmerge = tcPr.find(qn('w:vMerge')) if tcPr is not None else None
            
            # vmerge.get(qn('w:val')) can be 'restart', or None (which implies 'continue')
            vmerge_val = vmerge.get(qn('w:val'), 'continue') if vmerge is not None else 'none'
            
            text = cell.text.strip()
            
            if vmerge_val == 'restart':
                last_vmerge_text[out_idx] = text
                row_cells.append(text)
            elif vmerge_val == 'continue':
                # Use the tracked last text if available, fallback to text if somehow empty
                row_cells.append(last_vmerge_text.get(out_idx, text))
            else:
                row_cells.append(text)
                
        matrix.append(row_cells)

    # Verify all rows have same length
    if matrix:
        lengths = {len(row) for row in matrix}
        if len(lengths) != 1:
            logger.warning(f"Inconsistent row lengths after expansion: {lengths}")
            max_len = max(lengths)
            for i, row in enumerate(matrix):
                if len(row) < max_len:
                    matrix[i] = row + [""] * (max_len - len(row))
                    
    return matrix

# ---------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------
def clean(text: str) -> str:
    """Normalize text for comparison."""
    if not text:
        return ""
    # Replace line breaks, tabs, etc. with spaces, then collapse multiple spaces
    cleaned = re.sub(r"[\t\n\r\f\v]+", " ", str(text))
    cleaned = re.sub(r"\s+", " ", cleaned.strip().lower())
    return cleaned

def score_header_row(row: List[str]) -> int:
    """Count how many expected headers appear in the row."""
    row_texts = [clean(cell) for cell in row]
    score = 0
    for expected in EXPECTED_HEADERS:
        for cell_text in row_texts:
            if expected in cell_text:
                score += 1
                break
    return score

def is_separator_row(row: List[str]) -> bool:
    """Check if row contains midterm or final examination text."""
    row_text = clean(" ".join(str(cell) for cell in row))
    return bool(RE_SEP_MIDTERM.search(row_text) or RE_SEP_FINAL.search(row_text))

def is_orientation_row(row: List[str]) -> bool:
    """Check if row contains university wide student orientation."""
    row_text = clean(" ".join(str(cell) for cell in row))
    return bool(RE_ORIENTATION.search(row_text))

def is_repeated_header(row: List[str]) -> bool:
    """Check if row looks like a repeated header (high score)."""
    return score_header_row(row) >= 5

def is_merged_row(row: List[str]) -> bool:
    """
    Identify rows that are continuations of the previous week.
    They have a value in the first column (week) and all other columns empty.
    """
    if not row or len(row) == 0:
        return False
    first = str(row[0]).strip()
    rest = row[1:] if len(row) > 1 else []
    rest_empty = all(str(cell).strip() == "" for cell in rest)
    return first != "" and rest_empty

# ---------------------------------------------------
# EXTRACT TABLE AND HEADER
# ---------------------------------------------------
def extract_table_matrix(file_bytes: bytes) -> Tuple[List[List[str]], List[str], int]:
    """
    Find the learning plan table, expand it to a matrix,
    detect header rows, combine them into column names,
    and return the matrix, column names, and the index where data rows start.
    """
    doc = Document(io.BytesIO(file_bytes))

    # Find the learning plan table with improved keyword matching
    target_table = None
    target_keywords = ["week", "learning plan", "schedule", "course schedule", "topic", "topics", "lessons"]
    
    for table in doc.tables:
        preview = " ".join(
            cell.text.strip().lower() for row in table.rows[:10] for cell in row.cells
        )
        # Check if table has at least 2 of the target keywords
        keyword_matches = sum(1 for keyword in target_keywords if keyword in preview)
        if keyword_matches >= 2:
            target_table = table
            logger.info(f"Found target table with {len(table.rows)} rows, {keyword_matches} keywords matched")
            break

    if not target_table:
        logger.warning("No learning plan table found")
        return [], [], -1

    # Expand table to matrix
    matrix = table_to_matrix(target_table)
    if not matrix:
        logger.error("Expanded matrix is empty")
        return [], [], -1

    logger.info(f"Matrix shape: {len(matrix)} rows x {len(matrix[0])} columns")

    # Detect main header row (highest score, minimum 3)
    header_idx = -1
    best_score = -1
    for i, row in enumerate(matrix[:10]):
        score = score_header_row(row)
        logger.debug(f"Row {i} score: {score}")
        if score > best_score:
            best_score = score
            header_idx = i

    if header_idx == -1 or best_score < 3:
        logger.error(f"Could not identify a valid header row (best score {best_score})")
        return [], [], -1

    logger.info(f"Main header row at index {header_idx} with score {best_score}")

    # Check if next row contains Lec/Lab (second header row)
    second_header_idx = None
    if header_idx + 1 < len(matrix):
        next_row = matrix[header_idx + 1]
        next_text = " ".join(next_row).lower()
        if "lec" in next_text and "lab" in next_text:
            second_header_idx = header_idx + 1
            logger.info("Found second header row (Lec/Lab)")

    # Combine header rows to create column names
    if second_header_idx is not None:
        # Combine: main header + second header (concatenate with space),
        # but avoid duplicated words like "Week Week"
        col_names_raw = []

        def dedupe_words(label: str) -> str:
            words = re.split(r"\s+", label.strip())
            deduped = []
            for w in words:
                if not w:
                    continue
                if not deduped or deduped[-1].lower() != w.lower():
                    deduped.append(w)
            return " ".join(deduped)

        for col_idx in range(len(matrix[0])):
            main = matrix[header_idx][col_idx].strip()
            second = matrix[second_header_idx][col_idx].strip()
            if main and second:
                main_c = clean(main)
                second_c = clean(second)
                # If the second header cell repeats the main (e.g., "week" below "week"), keep main only
                if second_c == main_c or (main_c == "week" and "week" in second_c):
                    combined = main
                else:
                    combined = f"{main} {second}"
                col_names_raw.append(dedupe_words(combined))
            elif main:
                col_names_raw.append(dedupe_words(main))
            elif second:
                col_names_raw.append(dedupe_words(second))
            else:
                col_names_raw.append(f"Column_{col_idx}")
        data_start = second_header_idx + 1
    else:
        # No second header – use main header as is
        col_names_raw = [cell.strip() if cell.strip() else f"Column_{i}" for i, cell in enumerate(matrix[header_idx])]
        data_start = header_idx + 1

    # ENSURE UNIQUE COLUMN NAMES (Fixes "Setting with non-unique columns is not allowed")
    col_names = []
    seen = {}
    for name in col_names_raw:
        if name not in seen:
            col_names.append(name)
            seen[name] = 1
        else:
            seen[name] += 1
            unique_name = f"{name}_{seen[name]}"
            col_names.append(unique_name)

    logger.info(f"Column names ({len(col_names)}): {col_names}")
    logger.info(f"Data starts at row {data_start}")

    return matrix, col_names, data_start

# ---------------------------------------------------
# SECTION SPLITTING
# ---------------------------------------------------
def split_into_sections(matrix: List[List[str]], data_start: int) -> Dict[str, List[List[str]]]:
    """
    Split the data rows into preMidterm, preFinal, final
    based on rows containing 'midterm examination' or 'final examination'.
    """
    data_rows = matrix[data_start:]

    # Find indices of separator rows within data_rows
    sep_indices = [i for i, row in enumerate(data_rows) if is_separator_row(row)]
    logger.info(f"Separator rows at data-relative indices: {sep_indices}")

    sections = {
        'preMidterm': [],
        'preFinal': [],
        'final': []
    }

    if not sep_indices:
        sections['preMidterm'] = data_rows
        logger.info("No separators found, all data in preMidterm")
        return sections

    first_sep = sep_indices[0]
    sections['preMidterm'] = data_rows[:first_sep]
    logger.info(f"preMidterm: {len(sections['preMidterm'])} rows")

    if len(sep_indices) == 1:
        sections['preFinal'] = data_rows[first_sep + 1:]
        logger.info(f"preFinal: {len(sections['preFinal'])} rows")
        return sections

    second_sep = sep_indices[1]
    sections['preMidterm'] = data_rows[:first_sep]
    sections['preFinal'] = data_rows[first_sep + 1:second_sep]
    sections['final'] = data_rows[second_sep + 1:]
    logger.info(f"preMidterm: {len(sections['preMidterm'])} rows, preFinal: {len(sections['preFinal'])} rows, final: {len(sections['final'])} rows")
    return sections

# ---------------------------------------------------
# SEGMENT ANALYSIS
# ---------------------------------------------------
def analyze_segment(col_names: List[str], rows: List[List[str]]) -> Dict:
    """
    For a given segment, filter out non‑teaching rows,
    build a DataFrame, and count empty cells with column-specific analysis.
    """
    if not rows:
        logger.info("Segment has no rows, skipping")
        return None

    # Filter rows that are not separators, orientation, or repeated headers
    filtered_rows = []
    for i, row in enumerate(rows):
        if is_separator_row(row):
            logger.debug(f"Skipping separator row {i}")
            continue
        if is_orientation_row(row):
            logger.debug(f"Skipping orientation row {i}")
            continue
        if is_repeated_header(row):
            logger.debug(f"Skipping repeated header row {i}")
            continue
        filtered_rows.append(row)

    if not filtered_rows:
        logger.info("No rows remain after filtering")
        return None

    logger.info(f"After filtering, {len(filtered_rows)} rows remain")

    # Build DataFrame with the given column names
    try:
        df = pd.DataFrame(filtered_rows, columns=col_names).fillna('')
    except Exception as e:
        logger.error(f"DataFrame construction failed: {e}")
        logger.error(f"col_names length: {len(col_names)}, first row length: {len(filtered_rows[0])}")
        return None

    # Identify the week column (flexible naming)
    week_col = None
    for col in df.columns:
        col_clean = clean(col)
        if "week" in col_clean:
            week_col = col
            break
    # If no explicit "week" column, try first column if it looks like week numbers
    if not week_col and len(df.columns) > 0:
        first_col = df.columns[0]
        # Check if first column has mostly numeric values (like week numbers)
        numeric_count = df[first_col].apply(lambda x: bool(re.match(r'^\s*\d+\s*$', str(x)))).sum()
        if numeric_count >= len(df) // 2:
            week_col = first_col
            logger.info(f"Using first column '{week_col}' as week column (mostly numeric)")

    # Preserve original week values to detect vertical-merge continuation rows
    orig_week = None
    if week_col:
        orig_week = df[week_col].copy()
        # Forward-fill week column, treating placeholders as empty
        df[week_col] = df[week_col].apply(
            lambda x: None if str(x).strip().lower() in [
                "", "-", "–", "—", "---", "na", "n/a", "n.a.", "tba", "tbd"
            ] else x
        ).ffill()
        logger.info(f"Week column '{week_col}' forward-filled")

    # Handle vertically merged continuation rows:
    # - If a row has no week value, it's a continuation of the previous row
    # - Forward-fill all columns in continuation rows
    if week_col and orig_week is not None:
        # Identify continuation rows
        is_continuation = orig_week.apply(
            lambda x: str(x).strip().lower() in [
                "", "-", "–", "—", "---", "na", "n/a", "n.a.", "tba", "tbd"
            ]
        )
        # Forward-fill each column for continuation rows
        for col in df.columns:
            if col == week_col:
                continue
            # Forward-fill the entire column first
            col_filled = df[col].apply(
                lambda x: None if str(x).strip().lower() in [
                    "", "-", "–", "—", "---", "na", "n/a", "n.a.", "tba", "tbd"
                ] else x
            ).ffill().fillna("")
            # Apply forward-fill only to continuation rows
            df.loc[is_continuation, col] = col_filled.loc[is_continuation]

    # Count empty cells per column with column-specific logic
    empty_counts = {}
    placeholder_values = [
        "", "-", "–", "—", "---", "—–", "---",
        "na", "n/a", "n.a.", "n.a", "none", "null",
        "tba", "tbd", "tba/tbd", "tbd/tba",
        "...", "…", ".", "•", "·", "◦"
    ]

    for col in df.columns:
        col_clean = clean(col)
        col_missing = 0
        
        for idx, cell in df[col].items():
            cell_str = str(cell)
            cell_clean = clean(cell_str)
            
            # Skip continuation rows - they were forward-filled
            if week_col and orig_week is not None:
                orig_cell = str(orig_week.iloc[idx])
                if clean(orig_cell) in placeholder_values:
                    continue

            # Column-specific checks
            is_empty = False
            
            # 1. Week column: check if it's a valid week identifier
            if "week" in col_clean or col == week_col:
                # Check if it's a number, or "week X", etc.
                if cell_clean in placeholder_values:
                    is_empty = True
                else:
                    # Check if it's a valid week (numeric or "week N")
                    has_number = bool(re.search(r'\d+', cell_clean))
                    if not has_number:
                        is_empty = True
            
            # 2. All other columns: check placeholders and empty strings
            else:
                if cell_clean in placeholder_values:
                    is_empty = True
            
            if is_empty:
                col_missing += 1
        
        empty_counts[col] = col_missing
        logger.debug(f"Column '{col}' empty count: {col_missing}")

    return {
        "total_rows_clean": len(df),
        "total_columns": len(df.columns),
        "column_analysis": empty_counts,
        "empty_count": sum(empty_counts.values())
    }

# ---------------------------------------------------
# MAIN ANALYSIS FUNCTION
# ---------------------------------------------------
def analyze_syllabus_table(file_bytes: bytes) -> Dict:
    matrix, col_names, data_start = extract_table_matrix(file_bytes)
    if not matrix or data_start == -1:
        logger.error("Failed to extract table matrix")
        return {"pre_midterm": {}, "pre_final": {}}

    sections = split_into_sections(matrix, data_start)

    result = {}
    for section_name, section_rows in sections.items():
        if section_name == "final":
            # We output only preMidterm and preFinal
            continue
        logger.info(f"Analyzing section '{section_name}' with {len(section_rows)} raw rows")
        analysis = analyze_segment(col_names, section_rows)
        if analysis:
            result[section_name] = analysis["column_analysis"]
        else:
            result[section_name] = {}

    # Rename keys to match frontend expectations
    output = {
        "pre_midterm": result.get("preMidterm", {}),
        "pre_final": result.get("preFinal", {})
    }
    
    # Filter out duplicate week artifact columns (like "Week_2", "Week_3") if a primary "Week" column exists
    for section_key in ["pre_midterm", "pre_final"]:
        sec_data = output.get(section_key, {})
        if isinstance(sec_data, dict):
            has_week = any(re.match(r"^week$", str(k).strip(), re.IGNORECASE) for k in sec_data.keys())
            if has_week:
                to_delete = [k for k in sec_data.keys() if re.match(r"^week[_\s-]?\d+$", str(k).strip(), re.IGNORECASE)]
                for k in to_delete:
                    del sec_data[k]

    logger.info(f"Final output: {output}")
    return output


class FillFormRequest(BaseModel):
    file_path: str
    form_type: str
    form_data: dict

@app.post("/fill-form")
async def fill_form(req: FillFormRequest):
    req.file_path = normalize_path(req.file_path)
    if not os.path.exists(req.file_path):
        logger.error(f"File not found: {req.file_path}")
        raise HTTPException(404, f"File not found: {req.file_path}")
    
    try:
        doc = Document(req.file_path)
        if req.form_type == "form17":
            # 1. Fill header (Reviewer Name, Date, Course Code, Title, Instructor Name)
            reviewer_name = req.form_data.get("reviewerName", "")
            date_of_review = req.form_data.get("dateOfReview", "")
            course_code = req.form_data.get("courseCode", "")
            course_title = req.form_data.get("courseTitle", "")
            instructor_name = req.form_data.get("instructorName", "")
            
            for p in doc.paragraphs:
                p_text_clean = p.text.lower()
                if "reviewer" in p_text_clean and "date" in p_text_clean and "course code" in p_text_clean:
                    if len(p.runs) >= 11:
                        p.runs[1].text = f"\t\t{reviewer_name}\t"
                        p.runs[3].text = f"\t{date_of_review}\t"
                        p.runs[6].text = f"\t{course_code}\t"
                        p.runs[8].text = f"\t\t{course_title}\t"
                        p.runs[10].text = f"\t\t{instructor_name}\t"
                    break
            
            # 2. Fill checklist items
            checklist_raw = req.form_data.get("checklist", {})
            checklist_cleaned = {clean_search_text(k): v for k, v in checklist_raw.items()}
            
            for table in doc.tables:
                for row in table.rows:
                    if len(row.cells) >= 4:
                        cell0_clean = clean_search_text(row.cells[0].text)
                        matched_key = None
                        for key in checklist_cleaned:
                            if key in cell0_clean or cell0_clean in key:
                                if len(key) > 10:
                                    matched_key = key
                                    break
                        if matched_key:
                            item = checklist_cleaned[matched_key]
                            status = item.get("status", "") # "Yes" or "No" or ""
                            remarks = item.get("remarks", "")
                            
                            if status == "Yes":
                                row.cells[1].text = "✓"
                                row.cells[2].text = ""
                            elif status == "No":
                                row.cells[1].text = ""
                                row.cells[2].text = "✓"
                            else:
                                row.cells[1].text = ""
                                row.cells[2].text = ""
                                
                            row.cells[3].text = remarks
            
            # 3. Fill suggestions
            suggestions = req.form_data.get("suggestions", "")
            for idx, p in enumerate(doc.paragraphs):
                if "suggestions for improvement" in clean_search_text(p.text):
                    if idx + 1 < len(doc.paragraphs):
                        doc.paragraphs[idx + 1].text = suggestions
                    break
                    
        elif req.form_type == "form18":
            # 1. Fill header (Course Code, Title)
            course_code = req.form_data.get("courseCode", "")
            course_title = req.form_data.get("courseTitle", "")
            for p in doc.paragraphs:
                p_text_clean = p.text.lower()
                if "course code" in p_text_clean and "course title" in p_text_clean:
                    if len(p.runs) >= 5:
                        p.runs[1].text = f"\t{course_code}\t"
                        p.runs[4].text = f"\t{course_title}"
                    break
                    
            # 2. Fill suggestions table
            review_type = req.form_data.get("reviewType", "program")
            table = doc.tables[0] if review_type == "program" else doc.tables[1]
            suggestions = req.form_data.get("suggestions", [])
            
            for idx, sug in enumerate(suggestions):
                target_row_idx = idx + 1
                while target_row_idx >= len(table.rows):
                    table.add_row()
                row = table.rows[target_row_idx]
                row.cells[0].text = sug.get("reviewPoint", "")
                row.cells[1].text = sug.get("actionTaken", "")
                row.cells[2].text = str(sug.get("pageNumber", ""))
                row.cells[3].text = sug.get("remarks", "")
                
            # Clear remaining rows in the table
            for r_idx in range(len(suggestions) + 1, len(table.rows)):
                row = table.rows[r_idx]
                if len(row.cells) >= 4:
                    row.cells[0].text = ""
                    row.cells[1].text = ""
                    row.cells[2].text = ""
                    row.cells[3].text = ""
                    
        doc.save(req.file_path)
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to fill form: {e}", exc_info=True)
        raise HTTPException(500, str(e))

@app.get("/health")
async def health():
    return {"status": "ok"}


