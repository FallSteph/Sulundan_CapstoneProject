function extractCourseCredit(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const searchRegion = lines.slice(0, 500);
  console.log('🔍 Searching for course credit in first', searchRegion.length, 'lines');

  const labelPattern = /^Course\s*Credit:\s*(.*)/i;

  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    if (i % 50 === 0) console.log(`   Line ${i}: "${line.substring(0, 80)}..."`);

    const match = line.match(labelPattern);
    if (match) {
      let credit = match[1].trim();
      if (credit) {
        console.log('✅ Matched course credit (same line) at line', i, ':', credit);
        return credit;
      }
      if (i + 1 < searchRegion.length) {
        const nextLine = searchRegion[i + 1];
        if (!/^(Course\s*Code|Course\s*Title|Nominal\s*Duration|Prerequisite|Course\s*Description|Course\s*Outcomes|Learning\s*Template)/i.test(nextLine)) {
          credit = nextLine.trim();
          console.log('✅ Matched course credit (next line) at line', i+1, ':', credit);
          return credit;
        }
      }
    }
  }

  console.log('❌ No course credit found');
  return null;
}

module.exports = { extractCourseCredit };
