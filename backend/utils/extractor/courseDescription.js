function extractCourseDescription(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  const searchRegion = lines.slice(0, 500);
  console.log('🔍 Searching for course description in first', searchRegion.length, 'lines');

  const labelPattern = /^Course\s*Description:\s*(.*)/i;
  let startIndex = -1;
  let description = '';

  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    if (i % 50 === 0) console.log(`   Line ${i}: "${line.substring(0, 80)}..."`);

    const match = line.match(labelPattern);
    if (match) {
      startIndex = i;
      description = match[1].trim();
      break;
    }
  }

  if (startIndex === -1) {
    console.log('❌ No course description found');
    return null;
  }

  // If description already has content on the same line, we may still need to append following lines
  // because descriptions often span multiple lines.
  for (let i = startIndex + 1; i < searchRegion.length; i++) {
    const nextLine = searchRegion[i];
    // Stop if next line starts with another known section heading
    if (/^(Course\s*Outcomes|Learning\s*Template|References|Grading\s*System|Policies|Revision\s*History)/i.test(nextLine)) {
      break;
    }
    description += ' ' + nextLine;
  }

  console.log('✅ Matched course description (first 100 chars):', description.substring(0, 100) + '...');
  return description.trim();
}

module.exports = { extractCourseDescription };
