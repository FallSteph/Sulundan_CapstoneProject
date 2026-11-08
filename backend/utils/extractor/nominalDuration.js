function extractNominalDuration(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const searchRegion = lines.slice(0, 500);
  console.log('🔍 Searching for nominal duration in first', searchRegion.length, 'lines');

  const labelPattern = /^Nominal\s*Duration:\s*(.*)/i;

  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    if (i % 50 === 0) console.log(`   Line ${i}: "${line.substring(0, 80)}..."`);

    const match = line.match(labelPattern);
    if (match) {
      let duration = match[1].trim();
      if (duration) {
        console.log('✅ Matched nominal duration (same line) at line', i, ':', duration);
        return duration;
      }
      if (i + 1 < searchRegion.length) {
        const nextLine = searchRegion[i + 1];
        if (!/^(Course\s*Code|Course\s*Title|Course\s*Credit|Prerequisite|Course\s*Description|Course\s*Outcomes|Learning\s*Template)/i.test(nextLine)) {
          duration = nextLine.trim();
          console.log('✅ Matched nominal duration (next line) at line', i+1, ':', duration);
          return duration;
        }
      }
    }
  }

  console.log('❌ No nominal duration found');
  return null;
}

module.exports = { extractNominalDuration };
