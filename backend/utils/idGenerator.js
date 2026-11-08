const User = require("../models/User");
const Syllabus = require("../models/Syllabus");

/**
 * Returns the role prefix for employee IDs.
 * @param {string} dbRole - e.g. "FACULTY", "DEPT_HEAD", "DEAN", "CITL", "VPAA", "ADMIN"
 * @param {boolean} isSeniorFaculty - true if the FACULTY user is a senior faculty
 * @returns {string} - e.g. "F", "SF", "DH", "D", "C", "V", "A"
 */
function getRolePrefix(dbRole, isSeniorFaculty = false) {
  if (dbRole === "FACULTY") return isSeniorFaculty ? "SF" : "F";
  switch (dbRole) {
    case "DEPT_HEAD": return "DH";
    case "DEAN":      return "D";
    case "CITL":      return "C";
    case "VPAA":      return "V";
    case "ADMIN":     return "A";
    default:          return "F";
  }
}

/**
 * Pads a number to 3 digits, e.g. 1 → "001", 12 → "012".
 */
function pad3(n) {
  return String(n).padStart(3, "0");
}

/**
 * Generates a unique employee_id for the given role.
 * Queries the DB for the highest existing sequential number with this prefix,
 * then returns PREFIX + padded(N+1).
 *
 * Uses a retry loop (up to 5 attempts) to handle concurrent creation.
 *
 * @param {string} dbRole - "FACULTY" | "DEPT_HEAD" | "DEAN" | "CITL" | "VPAA" | "ADMIN"
 * @param {boolean} isSeniorFaculty - whether this is a senior faculty member
 * @returns {Promise<string>} - e.g. "F001", "SF003", "DH002"
 */
async function generateEmployeeId(dbRole, isSeniorFaculty = false) {
  const prefix = getRolePrefix(dbRole, isSeniorFaculty);
  const escPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (let attempt = 0; attempt < 5; attempt++) {
    // Find the highest number with this exact prefix (e.g. "SF001" → extract 1)
    const existing = await User.find(
      { employee_id: { $regex: `^${escPrefix}\\d{3}$` } },
      { employee_id: 1 }
    ).lean();

    let maxNum = 0;
    for (const u of existing) {
      const num = parseInt(u.employee_id.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }

    const candidate = `${prefix}${pad3(maxNum + 1)}`;

    // Check for uniqueness before committing
    const clash = await User.findOne({ employee_id: candidate }).lean();
    if (!clash) return candidate;
    // If clash, loop and try next number
  }

  // Fallback: use timestamp-based suffix to guarantee uniqueness
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

/**
 * Generates a unique tracking_id for a new Syllabus.
 * Uses the "S" prefix followed by a zero-padded sequential number.
 *
 * @returns {Promise<string>} - e.g. "S001", "S042"
 */
async function generateSyllabusTrackingId() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await Syllabus.find(
      { tracking_id: { $regex: /^S\d{3}$/ } },
      { tracking_id: 1 }
    ).lean();

    let maxNum = 0;
    for (const s of existing) {
      const num = parseInt(s.tracking_id.slice(1), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }

    const candidate = `S${pad3(maxNum + 1)}`;

    const clash = await Syllabus.findOne({ tracking_id: candidate }).lean();
    if (!clash) return candidate;
  }

  return `S${Date.now().toString().slice(-6)}`;
}

module.exports = { generateEmployeeId, generateSyllabusTrackingId, getRolePrefix, pad3 };
