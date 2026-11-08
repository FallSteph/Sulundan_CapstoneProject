function extractCourseOutcomes(text) {
  if (!text) {
    return { outcomes: [], missing: [], maxExceeded: false, minNotMet: true, isValid: false };
  }

  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  console.log('🔍 Searching for course outcomes...');
  let startIndex = -1;
  let sameLineContent = '';

  const labelPattern = /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course\s+|Intended\s+|Program\s+)?(?:Learning\s+)?Outcomes?(?:\s*\(?(?:CLOs?|COs?|ILOs?)\)?)?\s*[:\-=–—|]?\s*(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      labelPattern.test(line) ||
      /^(?:Course\s+)?(?:Learning\s+)?Outcomes\s*[:\-=–—|]?/i.test(line)
    ) {
      startIndex = i;
      console.log(`   Found "Course Outcomes" at line ${i}: "${line.substring(0, 60)}"`);
      const match = line.match(labelPattern);
      if (match && match[1] && match[1].trim().length > 0) {
        sameLineContent = match[1].trim();
      }
      break;
    }
  }

  if (startIndex === -1) {
    console.log('❌ No Course Outcomes section found');
    return { outcomes: [], missing: [], maxExceeded: false, minNotMet: true, isValid: false };
  }

  // Strict section end patterns (must be actual section headers, not text containing words like 'policies')
  const sectionEndPatterns = [
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Learning\s+Template|Learning\s+Plan|Course\s+Outline|Course\s+Schedule|Learning\s+Matrix|Curriculum\s+Map)/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*References\s*[:\-=–—|]?$/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course\s+|Institutional\s+|Class\s+)?Grading\s*(?:System|Scheme|Criteria)\b/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course\s+|Institutional\s+|Class\s+)?Policies\s*(?:(?:and|&)\s*(?:Procedures|Guidelines))?\s*[:\-=–—|]?$/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Course\s+|Institutional\s+|Class\s+)?Policies\s*[:\-=–—|]/i,
    /^(?:(?:\d+|[A-ZIVX]+)[\.\)]\s*|[-*•–—]\s*|\*+|\#+\s*)*(?:Syllabus\s+|Course\s+|Document\s+|Version\s+)?Revision\s*(?:History|Record|Log|Dates?)/i,
    /^(?:Prepared|Reviewed|Approved|Revised|Checked)\s*by\b/i,
    /^(?:Signatures?|Signatories)\b/i,
    /^Form\s*(17|18)\b/i
  ];

  // Pattern identifying a line that starts a CO item (e.g. "CO1:", "CLO 1:", "CO.1", etc.)
  const coStartPattern = /^(?:\[|\()?CO\s*[\.]?\s*\d+/i;
  const cloStartPattern = /^(?:\[|\()?CLO\s*[\.]?\s*\d+/i;
  const loStartPattern = /^(?:\[|\()?LO\s*[\.]?\s*\d+/i;

  function isCoMarker(str) {
    return coStartPattern.test(str) || cloStartPattern.test(str) || loStartPattern.test(str);
  }

  // Collect lines until next section heading
  const outcomeLines = [];
  if (sameLineContent) {
    outcomeLines.push(sameLineContent);
  }

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Never stop if line begins with a CO identifier (e.g. "CO1: Analyze potential solutions and policies...")
    if (!isCoMarker(line) && sectionEndPatterns.some(pattern => pattern.test(line))) {
      break;
    }
    outcomeLines.push(line);
  }

  console.log(`   Collected ${outcomeLines.length} lines after "Course Outcomes:"`);

  // Parse outcomes:
  // Supports formats:
  // 1. "CO1: text", "CO 1: text", "CO1 - text", "CO1. text", "CO.1: text", "CO1 text"
  // 2. "CLO1: text", "CLO 1: text", "LO1: text"
  // 3. "[CO1] text", "(CO1) text"
  // 4. "1. text", "2. text" if sequential numbered list
  const outcomes = [];
  const coPattern = /^(?:\[|\()?CO\s*[\.]?\s*(\d+)(?:\]|\))?\s*[:\.\-–—]?\s*(.*)/i;
  const cloPattern = /^(?:\[|\()?CLO\s*[\.]?\s*(\d+)(?:\]|\))?\s*[:\.\-–—]?\s*(.*)/i;
  const loPattern = /^(?:\[|\()?LO\s*[\.]?\s*(\d+)(?:\]|\))?\s*[:\.\-–—]?\s*(.*)/i;

  for (let i = 0; i < outcomeLines.length; i++) {
    const line = outcomeLines[i];
    const match = line.match(coPattern) || line.match(cloPattern) || line.match(loPattern);

    if (match) {
      const num = parseInt(match[1], 10);
      let text = (match[2] || '').trim();

      // Collect any multi-line continuation
      let j = i + 1;
      while (
        j < outcomeLines.length &&
        !isCoMarker(outcomeLines[j]) &&
        !sectionEndPatterns.some(p => p.test(outcomeLines[j]))
      ) {
        text += (text ? ' ' : '') + outcomeLines[j].trim();
        j++;
      }
      i = j - 1; // advance loop pointer

      // Clean text: strip leading dashes/colons/bullets
      text = text.replace(/^[:\.\-–—•*]+\s*/, '').replace(/\s+/g, ' ').trim();

      if (text.length > 0 || num) {
        outcomes.push({ number: num, text: text });
      }
    }
  }

  // Fallback: If no CO/CLO/LO markers found, check for numbered items like "1. Explain..." or "1) Explain..."
  if (outcomes.length === 0) {
    const numberedPattern = /^(\d+)[\.\)]\s+(.*)/;
    for (let i = 0; i < outcomeLines.length; i++) {
      const line = outcomeLines[i];
      const match = line.match(numberedPattern);
      if (match) {
        const num = parseInt(match[1], 10);
        let text = (match[2] || '').trim();

        let j = i + 1;
        while (
          j < outcomeLines.length &&
          !numberedPattern.test(outcomeLines[j]) &&
          !sectionEndPatterns.some(p => p.test(outcomeLines[j]))
        ) {
          text += (text ? ' ' : '') + outcomeLines[j].trim();
          j++;
        }
        i = j - 1;

        text = text.replace(/^[:\.\-–—•*]+\s*/, '').replace(/\s+/g, ' ').trim();
        if (text.length > 0) {
          outcomes.push({ number: num, text });
        }
      }
    }
  }

  if (outcomes.length === 0) {
    console.log('❌ No valid CO statements found in Course Outcomes section');
    return { outcomes: [], missing: [], maxExceeded: false, minNotMet: true, isValid: false };
  }

  const presentNumbers = outcomes.map(o => o.number).sort((a, b) => a - b);

  let missing = [];
  const maxPresent = presentNumbers[presentNumbers.length - 1];
  for (let i = 1; i <= maxPresent; i++) {
    if (!presentNumbers.includes(i)) missing.push(i);
  }

  if (presentNumbers[0] !== 1) {
    for (let i = 1; i < presentNumbers[0]; i++) {
      if (!missing.includes(i)) missing.push(i);
    }
  }

  missing.sort((a, b) => a - b);

  const exceeded = presentNumbers.filter(n => n > 5);
  const maxExceeded = exceeded.length > 0;
  const minNotMet = outcomes.length < 3;

  const isValid = missing.length === 0 && !maxExceeded && !minNotMet;

  console.log(`✅ Found ${outcomes.length} valid course outcomes. Missing: ${missing.length ? missing.join(', ') : 'none'}. Max exceeded: ${maxExceeded}. Min not met: ${minNotMet}`);

  return {
    outcomes,
    missing,
    maxExceeded,
    minNotMet,
    isValid
  };
}

module.exports = { extractCourseOutcomes };
