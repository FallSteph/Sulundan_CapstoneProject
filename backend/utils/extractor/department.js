function extractDepartment(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const searchRegion = lines.slice(0, 100);
  const labelPattern = /Department[:\s]+(.*)/i;
  for (let i = 0; i < searchRegion.length; i++) {
    const line = searchRegion[i];
    const match = line.match(labelPattern);
    if (match) {
      let dept = match[1].trim();
      if (dept) return dept;
      if (i + 1 < searchRegion.length) {
        return searchRegion[i+1].trim();
      }
    }
  }
  return null;
}

module.exports = { extractDepartment };
