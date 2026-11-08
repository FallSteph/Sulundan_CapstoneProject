const Semester = require("../models/Semester");

async function getSemesters(req, res) {
  try {
    const semesters = await Semester.find().sort({ startDate: -1 });
    res.json({ success: true, semesters });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch semesters" });
  }
}

async function addSemester(req, res) {
  try {
    const { name, code, startDate, endDate, isActive, isCurrent } = req.body;
    
    if (isCurrent) {
      await Semester.updateMany({}, { isCurrent: false });
    }
    
    const newSemester = new Semester({
      name,
      code,
      startDate,
      endDate,
      isActive,
      isCurrent
    });
    
    await newSemester.save();
    if (global.io) {
      global.io.emit("update_semesters");
    }
    res.status(201).json({ success: true, semester: newSemester });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to add semester" });
  }
}

async function updateSemester(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (updates.isCurrent) {
      await Semester.updateMany({ _id: { $ne: id } }, { isCurrent: false });
    }
    if (updates.isArchived) {
      updates.isCurrent = false;
    }
    
    const updated = await Semester.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, error: "Semester not found" });
    }
    
    if (global.io) {
      global.io.emit("update_semesters");
    }
    
    res.json({ success: true, semester: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update semester" });
  }
}

async function deleteSemester(req, res) {
  try {
    const { id } = req.params;
    await Semester.findByIdAndDelete(id);
    if (global.io) {
      global.io.emit("update_semesters");
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to delete semester" });
  }
}

async function resetToDefaults(req, res) {
  try {
    // 1. Clear existing semesters
    await Semester.deleteMany({});
    
    // 2. Define defaults based on school calendar pattern
    const year = new Date().getFullYear();
    const schoolYear = `${year}-${year + 1}`;
    
    // Generate a simple unique code if none provided, or use schoolYear
    const defaults = [
      {
        name: "1st Semester",
        code: `${schoolYear}-1ST`,
        startDate: new Date(year, 7, 1), // Aug 1
        endDate: new Date(year, 11, 20), // Dec 20
        isActive: true,
        isCurrent: true
      },
      {
        name: "2nd Semester",
        code: `${schoolYear}-2ND`,
        startDate: new Date(year + 1, 0, 15), // Jan 15
        endDate: new Date(year + 1, 4, 30), // May 30
        isActive: true,
        isCurrent: false
      },
      {
        name: "Summer",
        code: `${schoolYear}-SUMMER`,
        startDate: new Date(year + 1, 5, 1), // June 1
        endDate: new Date(year + 1, 6, 15), // July 15
        isActive: true,
        isCurrent: false
      }
    ];
    
    await Semester.insertMany(defaults);
    if (global.io) {
      global.io.emit("update_semesters");
    }
    const semesters = await Semester.find().sort({ startDate: -1 });
    res.json({ success: true, semesters });
  } catch (err) {
    console.error("Reset Semesters Error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to reset semesters" });
  }
}

module.exports = {
  getSemesters,
  addSemester,
  updateSemester,
  deleteSemester,
  resetToDefaults
};
