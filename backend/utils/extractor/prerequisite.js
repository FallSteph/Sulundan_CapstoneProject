function extractPrerequisite(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const searchRegion = lines.slice(0, 500);
  console.log('🔍 Searching for prerequisite in first', searchRegion.length, 'lines');

  const labelPattern = /Prerequisite[:\s]+(.*)/i;

  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    if (i % 50 === 0) console.log(`   Line ${i}: "${line.substring(0, 80)}..."`);

    const match = line.match(labelPattern);
    if (match) {
      let prereq = match[1].trim();
      if (prereq) {
        console.log('✅ Matched prerequisite (same line) at line', i, ':', prereq);
        return prereq;
      }
      if (i + 1 < searchRegion.length) {
        const nextLine = searchRegion[i + 1];
        // Ensure next line is not another label
        if (!/(Course\s*Code|Course\s*Title|Course\s*Credit|Nominal\s*Duration|Course\s*Description|Course\s*Outcomes|Learning\s*Template)/i.test(nextLine)) {
          prereq = nextLine.trim();
          console.log('✅ Matched prerequisite (next line) at line', i+1, ':', prereq);
          return prereq;
        }
      }
    }
  }

  console.log('❌ No prerequisite found');
  return "N/A";
}

module.exports = { extractPrerequisite };
