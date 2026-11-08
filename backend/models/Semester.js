const mongoose = require("mongoose");

const semesterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  isCurrent: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Semester", semesterSchema);
