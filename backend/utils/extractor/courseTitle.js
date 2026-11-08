function extractCourseTitle(text) {
  if (!text) return null;
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const searchRegion = lines.slice(0, 500);
  console.log('🔍 Searching for course title in first', searchRegion.length, 'lines');

  // More label variations and flexible separator handling
  const labelPattern = /(Course\s*Title|Subject\s*Title|Title\s*of\s*the\s*Course)[:\s\-]+(.*)/i;

  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    if (i % 50 === 0) console.log(`   Line ${i}: "${line.substring(0, 80)}..."`);

    const match = line.match(labelPattern);
    if (match) {
      let title = match[2].trim();
      if (title && title.length > 5) {
        // Clean up title
        title = title.replace(/^[:\s\-]+/, '').split(/\s{2,}/)[0].trim();
        console.log('✅ Matched course title (same line) at line', i, ':', title);
        return title;
      }
      
      // If title is missing on the same line, check next few lines
      for (let j = 1; j <= 5; j++) {
        if (i + j < searchRegion.length) {
          const nextLine = searchRegion[i + j];
          // Stop if we hit another field
          if (/(Course\s*Code|Course\s*Credit|Nominal\s*Duration|Prerequisite|Course\s*Description|Course\s*Outcomes|Learning\s*Template)/i.test(nextLine)) {
            break;
          }
          title = nextLine.trim();
          if (title.length > 5) {
            console.log('✅ Matched course title (offset line) at line', i+j, ':', title);
            return title;
          }
        }
      }
    }
  }

  // Last resort fallback: Look for a multi-word capitalized line in the first 50 lines that isn't a known heading
  for (const line of searchRegion.slice(0, 50)) {
    if (line.length > 10 && line === line.toUpperCase() && !/(COLLEGE|DEPARTMENT|SYLLABUS|UNIVERSITY|COURSE|SCHOOL|MANDATE|VISION|MISSION|QUALITY|INSTITUTIONAL|CORE)/.test(line)) {
      console.log('💡 Fallback: possible course title found in uppercase:', line);
      return line.trim();
    }
  }

  console.log('❌ No course title found');
  return null;
}

module.exports = { extractCourseTitle };
