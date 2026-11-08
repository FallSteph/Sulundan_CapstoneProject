function extractReferences(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Find start of References section
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^References$/i.test(lines[i])) {
      startIndex = i;
      break;
    }
  }
  if (startIndex === -1) {
    console.log('❌ No References section found');
    return { references: [], count: 0, missing: true };
  }

  // Define end patterns (next major heading)
  const endPatterns = [
    /^Grading\s*System$/i,
    /^Policies$/i,
    /^Revision\s*History$/i,
  ];

  // Collect lines until next heading
  const refLines = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (endPatterns.some(pattern => pattern.test(line))) {
      break;
    }
    refLines.push(line);
  }

  // Clean and collect references (they may be separated by blank lines or enumeration)
  const references = [];
  let currentRef = '';
  for (const line of refLines) {
    // If line looks like the start of a new reference (e.g., begins with author name)
    // Heuristic: if line starts with a capital letter and is not a continuation,
    // or if previous line ended with period/question mark.
    if (line.match(/^[A-Z]/) && !line.match(/^(and|&|with|et al)/i)) {
      if (currentRef) references.push(currentRef.trim());
      currentRef = line;
    } else {
      // Continuation line
      currentRef += ' ' + line;
    }
  }
  if (currentRef) references.push(currentRef.trim());

  console.log(`✅ Found ${references.length} references.`);
  return {
    references,
    count: references.length,
    missing: references.length === 0,
  };
}

module.exports = { extractReferences };
