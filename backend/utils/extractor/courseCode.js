/**
 * courseCode.js
 * Extracts course code from syllabus header/document text.
 * If the course code is empty or missing, returns null.
 */

function isPlaceholder(val) {
  if (!val) return true;
  const trimmed = val.trim();
  if (trimmed.length === 0) return true;
  if (/^(none|n\/?a|nil|null|tbd|tba|blank|[-_.\s:—–]+|\[.*?\]|\(.*?\))$/i.test(trimmed)) return true;
  return false;
}

const NEXT_FIELD_PATTERN = /^(Course\s*Title|Subject\s*Title|Title\s*of|Course\s*Credit|Nominal\s*Duration|Prerequisite|Course\s*Description|Course\s*Outcomes|Learning\s*Template|Department|College|Semester|Academic\s*Year|Term|Vision|Mission|Policies|Grading|References)/i;

const COURSE_CODE_VALID_REGEX = /^[A-Z]{2,6}\s*[\-\s]?\s*(?:\d{1,4}[A-Z]?|[A-Z]{1,4})(?:\s*[\-\s]\s*[A-Z0-9]+)?$/i;

function extractCourseCode(text) {
  if (!text) return null;
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const searchRegion = lines.slice(0, 500);

  const labelPattern = /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course|Subject|Course\s*\/\s*Subject)\s*(?:Code|Number|No\.?)\s*[:\-=–—|]?\s*(.*)$/i;

  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    const match = line.match(labelPattern);

    if (match) {
      console.log(`🔍 Found Course Code label at line ${i}: "${line}"`);
      let val = match[1] ? match[1].trim() : '';

      // If there's another field on the same line, isolate the course code part
      if (val && NEXT_FIELD_PATTERN.test(val)) {
        val = val.split(NEXT_FIELD_PATTERN)[0].trim();
      }

      // Clean leading/trailing artifacts
      val = val.replace(/^[:\s\-–—|]+/, '').replace(/[:\s\-–—|]+$/, '').trim();

      if (val.length > 0) {
        if (isPlaceholder(val)) {
          console.log(`❌ Course Code value is placeholder: "${val}" -> returning null`);
          return null;
        }
        // Take first code if multiple spaces/tabs exist before other text
        const code = val.split(/\s{2,}|\t/)[0].trim();
        if (code.length >= 2 && code.length <= 20 && !NEXT_FIELD_PATTERN.test(code)) {
          console.log(`✅ Matched course code (same line): "${code}"`);
          return code;
        }
        return null;
      }

      // If value is empty on the same line, check next line
      if (i + 1 < searchRegion.length) {
        const nextLine = searchRegion[i + 1].trim();
        // If next line is another field header, course code is empty
        if (NEXT_FIELD_PATTERN.test(nextLine)) {
          console.log(`❌ Next line is another field "${nextLine}" -> Course Code is empty`);
          return null;
        }
        if (isPlaceholder(nextLine)) {
          console.log(`❌ Next line is placeholder "${nextLine}" -> returning null`);
          return null;
        }
        // Only accept if next line matches a valid course code pattern
        const code = nextLine.split(/\s{2,}|\t/)[0].trim();
        if (code.length >= 2 && code.length <= 20 && COURSE_CODE_VALID_REGEX.test(code)) {
          console.log(`✅ Matched course code (next line): "${code}"`);
          return code;
        }
        console.log(`❌ Next line "${nextLine}" is not a course code -> returning null`);
        return null;
      }

      return null;
    }
  }

  console.log('❌ No Course Code section found -> returning null');
  return null;
}

module.exports = { extractCourseCode };
