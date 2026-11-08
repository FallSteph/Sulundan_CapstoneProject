function extractTitle(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const searchRegion = lines.slice(0, 60);
  const fieldPattern = /^\s*(Course\s*Title|Title)\s*:/i;
  const sectionHeadingWords = [
    'Mandate',
    'Vision',
    'Mission',
    'Quality Policy',
    'Institutional Outcomes',
    'Core Values',
    'Course Code',
    'Course Credit',
    'Nominal Duration',
    'Prerequisite',
    'Course Description',
    'Course Outcomes',
    'Learning Template',
    'References',
    'Grading System',
    'Policies',
    'Revision History',
    'Prepared by',
    'Revised by',
    'Reviewed by',
    'Approved by',
    'Date',
  ];
  function cleanLine(line) {
    let cleaned = line.replace(/^[#>*\-]+\s*/, '');
    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/__/g, '');
    return cleaned.trim();
  }
  function isSectionHeading(line) {
    const cleaned = cleanLine(line);
    return sectionHeadingWords.some(word => {
      const pattern = new RegExp(`^${word}`, 'i');
      return pattern.test(cleaned);
    });
  }
  function formatHeader(line) {
    return cleanLine(line).replace(/\s+/g, ' ').trim();
  }
  for (const line of searchRegion) {
    if (/Syllabus/i.test(line) && !fieldPattern.test(line) && !isSectionHeading(line)) {
      const titleOnly = formatHeader(line);
      return titleOnly;
    }
  }
  return null;
}

module.exports = { extractTitle };
