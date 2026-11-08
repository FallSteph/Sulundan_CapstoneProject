/**
 * One-time migration: assigns employee_id to existing Users and tracking_id to existing Syllabi
 * that currently have no formatted ID.
 *
 * Run with: node utils/migrationIds.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");
const Syllabus = require("../models/Syllabus");
const { generateEmployeeId, generateSyllabusTrackingId } = require("./idGenerator");

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not defined in .env");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("Connected.");

  // ── Migrate Users ──────────────────────────────────────────────────────────
  console.log("\n─── Migrating Users ───────────────────────────────────────────");

  // Process users in creation order to keep IDs consistent
  const users = await User.find({ employee_id: { $in: [null, "", undefined] } })
    .sort({ _id: 1 })
    .lean();

  console.log(`Found ${users.length} users without an employee_id`);

  let userSuccess = 0;
  let userSkip = 0;

  for (const u of users) {
    try {
      const id = await generateEmployeeId(u.role || "FACULTY", !!u.is_senior_faculty);
      await User.updateOne({ _id: u._id }, { $set: { employee_id: id } });
      console.log(`  ✓ ${u.email || u._id} → ${id}`);
      userSuccess++;
    } catch (err) {
      console.error(`  ✗ Failed for ${u.email || u._id}: ${err.message}`);
      userSkip++;
    }
  }

  console.log(`Users migrated: ${userSuccess}, skipped/failed: ${userSkip}`);

  // ── Migrate Syllabi ────────────────────────────────────────────────────────
  console.log("\n─── Migrating Syllabi ─────────────────────────────────────────");

  const syllabi = await Syllabus.find({ tracking_id: { $in: [null, "", undefined] } })
    .sort({ _id: 1 })
    .lean();

  console.log(`Found ${syllabi.length} syllabi without a tracking_id`);

  let sylSuccess = 0;
  let sylSkip = 0;

  for (const s of syllabi) {
    try {
      const tid = await generateSyllabusTrackingId();
      await Syllabus.updateOne({ _id: s._id }, { $set: { tracking_id: tid } });
      console.log(`  ✓ ${s.course_code || s._id} → ${tid}`);
      sylSuccess++;
    } catch (err) {
      console.error(`  ✗ Failed for ${s.course_code || s._id}: ${err.message}`);
      sylSkip++;
    }
  }

  console.log(`Syllabi migrated: ${sylSuccess}, skipped/failed: ${sylSkip}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("Migration complete.");
  console.log(`  Users:   ${userSuccess} assigned, ${userSkip} skipped`);
  console.log(`  Syllabi: ${sylSuccess} assigned, ${sylSkip} skipped`);

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
