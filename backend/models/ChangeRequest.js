const mongoose = require("mongoose");

const changeRequestSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["role", "college_department", "both"], required: true },
  requested_role: { type: String, enum: ["FACULTY", "DEPT_HEAD", "DEAN", "CITL", "VPAA"], default: null },
  requested_college: { type: String, default: "" },
  requested_department: { type: String, default: "" },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ChangeRequest", changeRequestSchema);
