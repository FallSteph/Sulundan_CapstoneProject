function extractPolicies(text) {
  if (!text) {
    return {
      policies: null,
      missing: true,
      rawText: null,
    };
  }

  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  console.log('🔍 Searching for Policies...');

  const headingRegex = /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course\s+|Institutional\s+|Class\s+)?Policies\s*(?:(?:and|&)\s*(?:Procedures|Guidelines))?\s*[:\-=–—|]?\s*(.*)$/i;

  let startIndex = -1;
  let sameLineContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Never treat a Course Outcome item as the Policies section heading
    if (/^(?:\[|\()?CO|CLO|LO/i.test(line)) {
      continue;
    }

    if (
      headingRegex.test(line) ||
      /^(?:Course\s+|Institutional\s+|Class\s+)?Policies\s*[:\-=–—|]?$/i.test(line)
    ) {
      startIndex = i;
      console.log(`   Found "Policies" at line ${i}: "${line.substring(0, 60)}"`);
      const match = line.match(headingRegex);
      if (match && match[1] && match[1].trim().length > 0) {
        sameLineContent = match[1].trim();
      }
      break;
    }
  }

  if (startIndex === -1) {
    console.log('❌ No Policies section found');
    return {
      policies: null,
      missing: true,
      rawText: null,
    };
  }

  // End patterns – Revision History, Signatures/Signatories, or other major headings
  const endPatterns = [
    // Revision History and variants (with or without colon/dates on same line)
    /\bRevision\s*(History|Record|Log|Dates?|Timeline)\b/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Syllabus\s+|Course\s+|Document\s+|Version\s+)?Revision\s*(?:History|Record|Log|Dates?|Timeline)?/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Version\s*History|Document\s*History|History\s*of\s*(?:Revisions?|Revision\s*History)|Revision\s*Dates?)/i,
    /^Revisions?\s*[:\-=–—]/i,

    // Signatures and Signatory lines
    /^(?:Prepared|Reviewed|Approved|Revised|Checked|Endorsed|Recommending\s*Approval|Submitted|Noted|Verified|Formulated)\s*by/i,
    /Prepared\s*by|Reviewed\s*by|Approved\s*by|Revised\s*by/i,
    /^(?:Signatures?|Signatories|Approval\s*(?:Sheet|Section)?)\s*:?/i,

    // Roles and known faculty names
    /^(?:Lead\s*Faculty|Department\s*Head|Program\s*Coordinator|Chairperson|Dean|CITL\s*Director|Director|VPAA|Vice\s*President|Course\s*Instructors?|Faculty\s*Member)\s*:?/i,
    /Lead\s*Faculty|Department\s*Head|CITL\s*Director|VPAA/i,
    /Czarissa Louise Navidad|Sales G\. Aribe|Marilou O\. Espina|Cecille Marie T\. Improgo|Hazel Jean M\. Abejuela|Lindy Joyce D\. Sario|Phoebe B\. Rayos/i,

    // Other major headings
    /^Grading\s*System/i,
    /^References/i,
    /^Course\s*(Outcomes|Description|Credit|Title|Code)\s*:?/i,
    /^Nominal\s*Duration\s*:?/i,
    /^Prerequisite\s*:?/i,
    /^Learning\s*(Template|Plan|Outcomes)\s*:?/i,
    /^Appendix/i,
    /^Form\s*(17|18)/i,
  ];

  // Collect lines until next heading / revision history / signatures
  const policyLines = [];
  if (sameLineContent) {
    policyLines.push(sameLineContent);
  }

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop if we hit a table row (starts with '+' or '|')
    if (line.startsWith('+') || line.startsWith('|')) {
      break;
    }

    // Stop if we hit Revision History, Signatures, or next section
    if (endPatterns.some(pattern => pattern.test(line))) {
      break;
    }

    policyLines.push(line);
  }

  const rawText = policyLines.join('\n').trim();
  console.log(`   Collected ${policyLines.length} lines after "Policies"`);

  const bulletPattern = /^(\u2022|[-*•–—])\s+/;
  const hasBullet = policyLines.some(line => bulletPattern.test(line));
  const formatted = policyLines.map(line => {
    if (!line.trim()) return line;
    if (bulletPattern.test(line)) return line.replace(/^\s+/, '');
    return hasBullet ? `• ${line}` : line;
  }).join('\n').trim();

  const hasContent = formatted.length > 0 || rawText.length > 0;

  return {
    policies: hasContent ? (formatted || rawText) : null,
    missing: !hasContent,
    rawText: hasContent ? rawText : null,
  };
}

module.exports = { extractPolicies };
