const mongoose = require("mongoose");

const syllabusSchema = new mongoose.Schema({
  tracking_id: { type: String, unique: true, sparse: true },
  faculty_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  college: String,
  department: String,
  course_code: String,
  course_title: String,
  semester: String,
  semester_id: { type: String, default: "1" },
  academic_year: String,
  file_path: String,
  bundle_id: String,
  form17_id: String,
  form18_id: String,
  form17_path: String,
  form18_path: String,
  form17Data: { type: mongoose.Schema.Types.Mixed, default: null },
  form18Data: { type: mongoose.Schema.Types.Mixed, default: null },
  review_history: [
    {
      reviewer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewer_name: String,
      reviewer_role: { type: String, enum: ["FACULTY", "SENIOR_FACULTY", "DEPT_HEAD", "DEAN", "CITL", "VPAA"] },
      action: { type: String, enum: ["approved", "returned", "forwarded"] },
      comment: String,
      timestamp: { type: Date, default: Date.now },
      version: { type: Number },
    }
  ],
  status: {
    type: String,
    enum: ["DRAFT", "FOR_REVIEW", "APPROVED", "RETURNED"],
    default: "DRAFT"
  },
  current_stage: {
    type: String,
    enum: ["COLLABORATOR", "SENIOR_FACULTY", "DEPT_HEAD", "DEAN", "CITL", "VPAA", null],
    default: null
  },
  claimed_by_senior_faculty_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  claimed_by_senior_faculty_name: { type: String, default: null },
  assigned_peer_reviewers: [
    {
      reviewer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewer_name: String,
      has_forwarded: { type: Boolean, default: false },
      action: { type: String, enum: ["forwarded", "returned", null], default: null },
      comment: { type: String, default: "" },
      forwarded_at: Date
    }
  ],
  forwarded_to_senior_faculty_at: Date,
  forwarded_to_dept_head_at: Date,
  forwarded_to_dean_at: Date,
  forwarded_to_citl_at: Date,
  forwarded_to_vpaa_at: Date,
  version: { type: Number, default: 1 },
  versionHistory: [
    {
      version: Number,
      file_path: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],
  ai_compliance_score: Number,
  scanned_file_path: String,
  aiAnalysis: { type: mongoose.Schema.Types.Mixed },
  appliedSignatures: [
    {
      signatureUrl: String,
      searchText: String,
      docType: String,
      align: String,
      appliedAt: { type: Date, default: Date.now }
    }
  ],
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  opened_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]

}, { timestamps: true });

module.exports = mongoose.model("Syllabus", syllabusSchema);
