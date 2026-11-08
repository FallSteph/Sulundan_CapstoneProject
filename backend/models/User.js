const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  employee_id: { type: String, unique: true, sparse: true },
  is_senior_faculty: { type: Boolean, default: false },
  first_name: String,
  last_name: String,
  email: { type: String, unique: true, lowercase: true, trim: true },
  password_hash: String,
  role: {
    type: String,
    enum: ["FACULTY", "DEPT_HEAD", "DEAN", "CITL", "VPAA", "ADMIN"]
  },
  college: { type: String, default: "" },
  department: { type: String, default: "" },
  status: {
    type: String,
    enum: ["ACTIVE", "ARCHIVED"],
    default: "ACTIVE"
  },
  is_active: { type: Boolean, default: true },
  is_locked: { type: Boolean, default: false },
  last_login: { type: Date, default: null },
  updated_at: { type: Date, default: Date.now },
  notifications_enabled: { type: Boolean, default: true },
  theme_preference: { type: String, enum: ["light", "dark"], default: "light" },
  password_reset_token: { type: String, default: null },
  password_reset_expires: { type: Date, default: null }
});

module.exports = mongoose.model("User", userSchema);
