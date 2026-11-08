const mongoose = require("mongoose");

const templateSchema = new mongoose.Schema({
  type: { type: String, enum: ["syllabus", "form17", "form18"], required: true },
  title: { type: String, default: "" },
  file_name: { type: String, required: true },
  file_path: { type: String, required: true },
  version: { type: Number, default: 1 },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

module.exports = mongoose.model("Template", templateSchema);
