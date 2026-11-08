function extractSemester(text) {
  const searchRegion = text.substring(0, 1000).toLowerCase();
  
  // Look for patterns like "First Semester", "Second Semester", "Summer", etc.
  if (searchRegion.includes("first semester") || searchRegion.includes("1st semester")) {
    return "First Semester";
  }
  if (searchRegion.includes("second semester") || searchRegion.includes("2nd semester")) {
    return "Second Semester";
  }
  if (searchRegion.includes("summer")) {
    return "Summer";
  }
  
  // Look for academic year
  const ayMatch = searchRegion.match(/a\.y\.\s*(\d{4}-\d{4})/i);
  if (ayMatch) {
    return `AY ${ayMatch[1]}`;
  }

  return null;
}

module.exports = { extractSemester };
