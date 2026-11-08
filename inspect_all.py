from docx import Document
import sys
doc = Document(sys.argv[1])
for i, p in enumerate(doc.paragraphs):
    text = p.text.strip()
    if text:
        print(f"Para {i}: {repr(text)}")
for i, t in enumerate(doc.tables):
    print(f"Table {i} with {len(t.rows)} rows")
