function extractRevisionHistory(text) {
  if (!text) {
    return {
      revisionHistory: null,
      missing: true,
      rawText: null,
    };
  }

  console.log('🔍 Searching for Revision History...');

  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Broad heading patterns supporting prefixes (numbers, bullets, asterisks), synonyms, and same-line content
  const headingRegex = /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Syllabus\s+|Course\s+|Document\s+|Version\s+)?Revision\s*(?:History|Record|Log|Dates?|Timeline)?(?:\s*\(s\))?\s*[:\-=–—|]?/i;
  const versionHistoryRegex = /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Version\s*History|Document\s*History|History\s*of\s*(?:Revisions?|Revision\s*History)|Revision\s*Dates?)\s*[:\-=–—|]?/i;

  let startIndex = -1;
  let sameLineDateContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line contains a revision heading
    const isHeading =
      headingRegex.test(line) ||
      versionHistoryRegex.test(line) ||
      /\bRevision\s*(?:History|Record|Log|Dates?|Timeline)\b/i.test(line);

    if (isHeading) {
      startIndex = i;
      console.log(`   Found "Revision History" at line ${i}: "${line.substring(0, 80)}"`);

      // Extract any content that appears immediately after the heading on the same line
      const match = line.match(/^.*?\b(?:Revision\s*(?:History|Record|Log|Dates?|Timeline)?|Version\s*History|Document\s*History|History\s*of\s*(?:Revisions?|Revision\s*History)|Revision\s*Dates?)\s*[:\-=–—|]?\s*(.*)$/i);
      if (match && match[1] && match[1].trim().length > 0) {
        sameLineDateContent = match[1].trim();
      }
      break;
    }
  }

  // Fallback search across entire text if not found line-by-line
  if (startIndex === -1) {
    const fallbackMatch = text.match(/(?:Revision\s*(?:History|Record|Log|Dates?|Timeline)?|Version\s*History|Document\s*History|History\s*of\s*Revisions?)\s*[:\-=–—]?\s*([^\n\r]+(?:\n[^\n\r]+)*?)(?=\n\s*(?:(?:Prepared|Reviewed|Approved|Revised|Checked|Endorsed|Submitted|Noted)\s*by|Lead\s*Faculty|Department\s*Head|Dean|CITL\s*Director|Director|VPAA|Policies|Grading\s*System|References|\+{3,}|\|\s*-{3,}|\z))/i);
    if (fallbackMatch && fallbackMatch[1] && fallbackMatch[1].trim().length > 0) {
      const rawText = fallbackMatch[1].trim();
      console.log(`   Found Revision History via fallback pattern`);
      return {
        revisionHistory: rawText,
        missing: false,
        rawText,
      };
    }

    console.log('❌ No Revision History section found');
    return {
      revisionHistory: null,
      missing: true,
      rawText: null,
    };
  }

  // End patterns that signal the next section or signature block
  const stopPatterns = [
    // Next sections
    /^Policies\s*:?/i,
    /^Grading\s*System\s*:?/i,
    /^References\s*:?/i,
    /^Course\s*(Outcomes|Description|Credit|Title|Code)\s*:?/i,
    /^Nominal\s*Duration\s*:?/i,
    /^Prerequisite\s*:?/i,
    /^Learning\s*(Template|Plan|Outcomes)\s*:?/i,
    /^Appendix/i,
    /^Form\s*(17|18)/i,

    // Signatories and Approval headers
    /^(Prepared|Reviewed|Approved|Revised|Checked|Endorsed|Recommending\s*Approval|Submitted|Noted|Verified|Formulated)\s*by\s*(\/\s*Date)?\s*:?/i,
    /^(Prepared|Reviewed|Approved|Revised|Checked|Endorsed)\s*by\s*:\s*(Prepared|Reviewed|Approved|Revised|Checked|Endorsed)\s*by/i,
    /^Signatures?\s*:?/i,
    /^Signatories\s*:?/i,
    /^Approval\s*(Sheet|Section)?\s*:?/i,

    // Common signatory roles / titles
    /^(Lead\s*Faculty|Department\s*Head|Program\s*Coordinator|Chairperson|Dean|CITL\s*Director|Director|VPAA|Vice\s*President|Course\s*Instructors?|Faculty\s*Member)\s*:?/i,
    /Lead\s*Faculty|Department\s*Head|CITL\s*Director|VPAA/i,

    // Known faculty names commonly in signature area
    /Czarissa Louise Navidad|Sales G\. Aribe|Marilou O\. Espina|Cecille Marie T\. Improgo|Hazel Jean M\. Abejuela|Lindy Joyce D\. Sario|Phoebe B\. Rayos/i,
  ];

  const dateLines = [];
  if (sameLineDateContent) {
    dateLines.push(sameLineDateContent);
  }

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop if we hit a table boundary row (starts with '+' or '|')
    if (line.startsWith('+') || line.startsWith('|')) {
      break;
    }

    // Stop if we hit another heading or signature line
    if (stopPatterns.some(pattern => pattern.test(line))) {
      break;
    }

    // Otherwise, collect this line as part of Revision History
    dateLines.push(line);
  }

  const rawText = dateLines.join('\n').trim();
  console.log(`   Collected ${dateLines.length} line(s) after "Revision History"`);

  const hasContent = rawText.length > 0;

  return {
    revisionHistory: hasContent ? rawText : null,
    missing: !hasContent,
    rawText: hasContent ? rawText : null,
  };
}

module.exports = { extractRevisionHistory };
