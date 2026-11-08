/**
 * gradingSystem.js
 * Extracts grading system details from syllabus text.
 */

function extractGradingSystem(text) {
  if (!text) {
    return {
      majorOutput: null,
      classStanding: null,
      midTermGrade: null,
      finalTermGrade: null,
      finalGrade: null,
      missing: true,
      rawText: null,
    };
  }

  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  console.log('🔍 Searching for Grading System...');

  const headingRegex = /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course\s+|Institutional\s+|Class\s+)?Grading\s*(?:System|Scheme|Criteria|Distribution)\s*[:\-=–—|]?/i;

  let startIndex = -1;
  let sameLineContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headingRegex.test(line) || /\b(?:Course\s+)?Grading\s*System\b/i.test(line)) {
      startIndex = i;
      console.log(`   Found "Grading System" at line ${i}: "${line.substring(0, 60)}"`);
      const match = line.match(/^.*?\b(?:Course\s+|Institutional\s+|Class\s+)?Grading\s*(?:System|Scheme|Criteria|Distribution)\s*[:\-=–—|]?\s*(.*)$/i);
      if (match && match[1] && match[1].trim().length > 0) {
        sameLineContent = match[1].trim();
      }
      break;
    }
  }

  if (startIndex === -1) {
    console.log('❌ No Grading System section found');
    return {
      majorOutput: null,
      classStanding: null,
      midTermGrade: null,
      finalTermGrade: null,
      finalGrade: null,
      missing: true,
      rawText: null,
    };
  }

  // End patterns – Stop when reaching Policies, Revision History, Signatures, etc.
  const endPatterns = [
    // Policies
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course\s+|Institutional\s+|Class\s+)?Policies\b/i,
    /\b(?:Course|Institutional|Class)?\s*Policies\s*[:\-=–—|]?/i,

    // Revision History
    /\bRevision\s*(History|Record|Log|Dates?|Timeline)\b/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Syllabus\s+|Course\s+|Document\s+|Version\s+)?Revision\s*(?:History|Record|Log|Dates?|Timeline)?/i,
    /^Revisions?\s*[:\-=–—]/i,

    // Signatures and Signatories
    /^(?:Prepared|Reviewed|Approved|Revised|Checked|Endorsed|Recommending\s*Approval|Submitted|Noted|Verified|Formulated)\s*by/i,
    /Prepared\s*by|Reviewed\s*by|Approved\s*by|Revised\s*by/i,
    /^(?:Signatures?|Signatories|Approval\s*(?:Sheet|Section)?)\s*:?/i,

    // Faculty titles
    /^(?:Lead\s*Faculty|Department\s*Head|Program\s*Coordinator|Chairperson|Dean|CITL\s*Director|Director|VPAA|Vice\s*President|Course\s*Instructors?|Faculty\s*Member)\s*:?/i,

    // Other sections
    /^References\b/i,
    /^Course\s*(Outcomes|Description|Credit|Title|Code)\s*:?/i,
    /^Nominal\s*Duration\s*:?/i,
    /^Prerequisite\s*:?/i,
    /^Learning\s*(Template|Plan|Outcomes)\s*:?/i,
    /^Appendix/i,
    /^Form\s*(17|18)/i
  ];

  const gradingLines = [];
  if (sameLineContent) {
    gradingLines.push(sameLineContent);
  }

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop if we hit Policies or any subsequent section
    if (endPatterns.some(pattern => pattern.test(line))) {
      break;
    }

    gradingLines.push(line);
  }

  const rawText = gradingLines.join('\n').trim();
  console.log(`   Collected ${gradingLines.length} lines after "Grading System"`);

  // Helper to clean extracted grade strings
  function cleanGradeVal(val) {
    if (!val) return null;
    let cleaned = val.trim();
    cleaned = cleaned.replace(/^[:\-=–—|]+\s*/, '');
    cleaned = cleaned.replace(/\s*[:\-=–—|]+$/, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
  }

  // 1. Major Output (e.g. 40%, 50%)
  let majorOutput = null;
  const majorOutputMatch =
    rawText.match(/Major\s*(?:Output|Exam|Requirement|Assessments?)s?(?:\s*\(?MO\)?)?\s*[:\-=–—]?\s*(\d+(?:\.\d+)?\s*%)/i) ||
    rawText.match(/(\d+(?:\.\d+)?\s*%)\s*[-–—:]?\s*Major\s*(?:Output|Exam|Requirement|Assessments?)/i) ||
    rawText.match(/\bMO\s*[:\-=–—]?\s*(\d+(?:\.\d+)?\s*%)/i);

  if (majorOutputMatch) {
    majorOutput = majorOutputMatch[1].replace(/\s+/g, '');
  } else {
    for (let i = 0; i < gradingLines.length; i++) {
      if (/Major\s*(?:Output|Exam|Requirement)/i.test(gradingLines[i])) {
        const nextLine = gradingLines[i + 1];
        if (nextLine) {
          const numMatch = nextLine.match(/(\d+(?:\.\d+)?\s*%)/);
          if (numMatch) {
            majorOutput = numMatch[1].replace(/\s+/g, '');
            break;
          }
        }
      }
    }
  }

  // 2. Class Standing (e.g. 30%, 60%)
  let classStanding = null;
  const classStandingMatch =
    rawText.match(/Class\s*Standing(?:\s*\(?CS\)?)?\s*[:\-=–—]?\s*(\d+(?:\.\d+)?\s*%)/i) ||
    rawText.match(/(\d+(?:\.\d+)?\s*%)\s*[-–—:]?\s*Class\s*Standing/i) ||
    rawText.match(/Formative\s*Assessments?\s*[:\-=–—]?\s*(\d+(?:\.\d+)?\s*%)/i) ||
    rawText.match(/\bCS\s*[:\-=–—]?\s*(\d+(?:\.\d+)?\s*%)/i);

  if (classStandingMatch) {
    classStanding = classStandingMatch[1].replace(/\s+/g, '');
  } else {
    for (let i = 0; i < gradingLines.length; i++) {
      if (/Class\s*Standing|Formative\s*Assessment/i.test(gradingLines[i])) {
        const nextLine = gradingLines[i + 1];
        if (nextLine) {
          const numMatch = nextLine.match(/(\d+(?:\.\d+)?\s*%)/);
          if (numMatch) {
            classStanding = numMatch[1].replace(/\s+/g, '');
            break;
          }
        }
      }
    }
  }

  // Lookahead boundary to prevent field label bleed.
  // Labels must be followed by a delimiter (:, =, -, etc.) or be a new section heading to count as a boundary.
  const labelBoundary = '(?=(?:\\s*(?:(?:Final[\\s-]*Term\\s*Grade(?:\\s*\\(?FTG\\)?)?|\\bFTG\\b)\\s*[:\\-=–—]|(?:(?<!Final[\\s-]*)Final\\s*Grade(?:\\s*\\(?FG\\)?)?|\\bFG\\b|Semestral\\s*Grade)\\s*[:\\-=–—]|(?:Mid[\\s-]*Term\\s*Grade(?:\\s*\\(?MTG\\)?)?|\\bMTG\\b)\\s*[:\\-=–—]|(?:Major\\s*Output|Class\\s*Standing|Course\\s*Policies|Policies\\b)\\s*[:\\-=–—]))|[\\n\\r]|$)';

  // 3. Midterm Grade (MTG)
  let midTermGrade = null;
  const midTermMatch = rawText.match(new RegExp('(?:Mid[\\s-]*Term\\s*Grade(?:\\s*\\(?MTG\\)?)?|\\bMTG\\b)\\s*[:\\-=–—]?\\s*([^\\n\\r]+?' + labelBoundary + ')', 'i'));
  if (midTermMatch && midTermMatch[1]) {
    midTermGrade = cleanGradeVal(midTermMatch[1]);
  }

  // 4. Final Term Grade (FTG)
  let finalTermGrade = null;
  const finalTermMatch = rawText.match(new RegExp('(?:Final[\\s-]*Term\\s*Grade(?:\\s*\\(?FTG\\)?)?|\\bFTG\\b)\\s*[:\\-=–—]?\\s*([^\\n\\r]+?' + labelBoundary + ')', 'i'));
  if (finalTermMatch && finalTermMatch[1]) {
    finalTermGrade = cleanGradeVal(finalTermMatch[1]);
  }

  // 5. Final Grade (FG) - isolated from Final Term Grade
  let finalGrade = null;
  const finalGradeMatch = rawText.match(new RegExp('(?:(?:^|\\n|[^a-zA-Z0-9])(?<!Final[\\s-]*)(?:Final\\s*Grade(?:\\s*\\(?FG\\)?)?|\\bFG\\b|Semestral\\s*Grade))\\s*[:\\-=–—]\\s*([^\\n\\r]+?' + labelBoundary + ')', 'i'));
  if (finalGradeMatch && finalGradeMatch[1]) {
    finalGrade = cleanGradeVal(finalGradeMatch[1]);
  }

  // Fallback line-by-line inspection if any field is still missing
  for (let i = 0; i < gradingLines.length; i++) {
    const line = gradingLines[i];

    if (!midTermGrade && /Mid[\s-]*Term\s*Grade/i.test(line)) {
      const match = line.match(/Mid[\s-]*Term\s*Grade(?:\s*\(?MTG\)?)?\s*[:\-=–—]?\s*(.*)$/i);
      if (match && match[1] && match[1].trim()) {
        const val = match[1].split(/(?:Final[\s-]*Term\s*Grade|Final\s*Grade\s*[:\-=–—])/i)[0];
        midTermGrade = cleanGradeVal(val);
      } else if (gradingLines[i + 1] && !/^(?:Final|Major|Class|Policies|Revision)/i.test(gradingLines[i + 1])) {
        midTermGrade = cleanGradeVal(gradingLines[i + 1]);
      }
    }

    if (!finalTermGrade && /Final[\s-]*Term\s*Grade/i.test(line)) {
      const match = line.match(/Final[\s-]*Term\s*Grade(?:\s*\(?FTG\)?)?\s*[:\-=–—]?\s*(.*)$/i);
      if (match && match[1] && match[1].trim()) {
        const val = match[1].split(/(?:Final\s*Grade\s*[:\-=–—]|Mid[\s-]*Term)/i)[0];
        finalTermGrade = cleanGradeVal(val);
      } else if (gradingLines[i + 1] && !/^(?:Final|Major|Class|Policies|Revision)/i.test(gradingLines[i + 1])) {
        finalTermGrade = cleanGradeVal(gradingLines[i + 1]);
      }
    }

    if (!finalGrade && /(?:^|[^\w])Final\s*Grade/i.test(line) && !/Final[\s-]*Term/i.test(line)) {
      const match = line.match(/Final\s*Grade(?:\s*\(?FG\)?)?\s*[:\-=–—]?\s*(.*)$/i);
      if (match && match[1] && match[1].trim()) {
        finalGrade = cleanGradeVal(match[1]);
      } else if (gradingLines[i + 1] && !/^(?:Final|Major|Class|Policies|Revision)/i.test(gradingLines[i + 1])) {
        finalGrade = cleanGradeVal(gradingLines[i + 1]);
      }
    }
  }

  // Extra fallback: Direct search for Final Grade formula if still missing
  if (!finalGrade) {
    const directFG = rawText.match(/(?:^|[^\w])(?<!Final[\s-]*)Final\s*Grade(?:\s*\(?FG\)?)?\s*[:\-=–—]\s*([^:\n\r]+)/i);
    if (directFG && directFG[1]) {
      finalGrade = cleanGradeVal(directFG[1]);
    }
  }

  console.log(`✅ Extracted: Major Output=${majorOutput}, Class Standing=${classStanding}`);
  console.log(`   MidTerm Grade=${midTermGrade}, FinalTerm Grade=${finalTermGrade}, Final Grade=${finalGrade}`);

  const hasAny =
    (majorOutput && majorOutput.trim().length > 0) ||
    (classStanding && classStanding.trim().length > 0) ||
    (midTermGrade && String(midTermGrade).trim().length > 0) ||
    (finalTermGrade && String(finalTermGrade).trim().length > 0) ||
    (finalGrade && String(finalGrade).trim().length > 0);
  const isEmpty = !hasAny && (!rawText || rawText.trim().length === 0);

  return {
    majorOutput,
    classStanding,
    midTermGrade,
    finalTermGrade,
    finalGrade,
    missing: isEmpty,
    rawText: hasAny ? rawText : null,
  };
}

module.exports = { extractGradingSystem };
