import re
import io
from docx import Document


def extractTitle(text: str):
    """
    Extract main course header from text.

    Rules:
    - Search only first 20 lines.
    - Must contain a course code pattern (e.g., PEL132, CS101, IT 201).
    - Ignore institutional section headings.
    - Ignore field labels like "Course Code:".
    - Return the matched line or None.
    """

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    search_region = lines[:20]

    # Course code pattern (letters + digits, optional space or dash)
    course_code_pattern = re.compile(r'\b[A-Z]{2,5}[-\s]?\d{2,4}\b')

    # Field label pattern
    field_pattern = re.compile(r'(Course\s*Title|Title|Course\s*Code)[:\s]+', re.IGNORECASE)

    # Section headings to ignore
    ignored_headings = [
        'Mandate',
        'Vision',
        'Mission',
        'Quality Policy',
        'Institutional Outcomes',
        'Core Values',
        'Course Code',
        'Course Credit',
        'Nominal Duration',
        'Prerequisite',
        'Course Description',
        'Course Outcomes',
        'Learning Template',
        'References',
        'Grading System',
        'Policies',
        'Revision History',
        'Prepared by',
        'Revised by',
        'Reviewed by',
        'Approved by',
        'Date',
    ]

    def is_section_heading(line: str):
        for heading in ignored_headings:
            if re.search(re.escape(heading), line, re.IGNORECASE):
                return True
        return False

    for line in search_region:
        if (
            course_code_pattern.search(line) and
            not field_pattern.search(line) and
            not is_section_heading(line) and
            len(line) > 10
        ):
            return line

    return None

def extract_title_bytes(file_bytes: bytes):
    doc = Document(io.BytesIO(file_bytes))
    lines = []
    for p in doc.paragraphs:
        t = p.text.strip()
        if t:
            lines.append(t)
        if len(lines) >= 50:
            break
    text = "\n".join(lines)
    return extractTitle(text)
