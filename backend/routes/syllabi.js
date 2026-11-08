const express = require("express");
const router = express.Router();
const { createSyllabus, listSyllabi, getSyllabus, updateBundle, updateSyllabus, reuploadSyllabus, newVersion, uploadScanned, downloadBulk, exportReports, saveAiAnalysis, claimSyllabus, markOpened, deleteSyllabus, updateCollaborators } = require("../controllers/syllabiController");

// Static-like GET routes first to avoid conflicts with dynamic IDs if any were added later
router.get("/bulk-download", downloadBulk);
router.post("/bulk-download", downloadBulk); // Allow POST for long ID lists
router.get("/export-reports", exportReports);
router.get("/", listSyllabi);
router.get("/:id", getSyllabus);

router.post("/", createSyllabus);
router.post("/:id/claim", claimSyllabus);
router.post("/:id/reupload", reuploadSyllabus);
router.post("/:id/new-version", newVersion);
router.patch("/:id/collaborators", updateCollaborators);
router.post("/:id/ai-analysis", saveAiAnalysis);
router.post("/:id/scanned", uploadScanned);
router.post("/:id/opened", markOpened);
router.patch("/:id/bundle", updateBundle);
router.patch("/:id", updateSyllabus);
router.delete("/:id", deleteSyllabus);

module.exports = router;
