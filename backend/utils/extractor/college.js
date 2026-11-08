function extractCollege(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const searchRegion = lines.slice(0, 100);
  const labelPattern = /(College|School)[:\s]+(.*)/i;
  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    const match = line.match(labelPattern);
    if (match) {
      let college = match[2].trim();
      if (college) return college;
      if (i + 1 < searchRegion.length) {
        return searchRegion[i+1].trim();
      }
    }
  }
  // Fallback: look for lines containing "College of"
  for (const line of searchRegion) {
    if (/College of/i.test(line)) return line.trim();
  }
  return null;
}

module.exports = { extractCollege };
