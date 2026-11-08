const express = require("express");
const router = express.Router();
const { runBackup, cleanupOldBackups } = require("../utils/backup");
const { protect, authorize } = require("../middleware/auth");
const fs = require('fs');
const path = require('path');

// Protect all routes under /admin
router.use(protect);
router.use(authorize("ADMIN"));

/**
 * Trigger a manual backup
 */
router.post("/backup", async (req, res) => {
  try {
    console.log(`[Admin] Manual backup triggered by ${req.user.email}`);
    const backupFile = await runBackup();
    res.json({ success: true, message: "Backup created successfully", file: path.basename(backupFile) });
  } catch (err) {
    console.error("[Admin] Manual backup failed:", err);
    res.status(500).json({ success: false, error: "Backup failed: " + err.message });
  }
});

/**
 * List all backups
 */
router.get("/backups", (req, res) => {
  try {
    const backupsDir = path.resolve(__dirname, "..", "backups");
    if (!fs.existsSync(backupsDir)) {
      return res.json({ success: true, backups: [] });
    }
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith(".zip"))
      .map(f => {
        const stats = fs.statSync(path.join(backupsDir, f));
        return {
          filename: f,
          size: (stats.size / (1024 * 1024)).toFixed(2) + " MB",
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, backups: files });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to list backups" });
  }
});

/**
 * Download a backup file
 */
router.get("/backups/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.resolve(__dirname, "..", "backups", filename);
  
  if (!fs.existsSync(filePath) || !filename.endsWith(".zip")) {
    return res.status(404).json({ success: false, error: "Backup file not found" });
  }
  
  res.download(filePath);
});

/**
 * Delete a backup file
 */
router.delete("/backups/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.resolve(__dirname, "..", "backups", filename);
  
  if (!fs.existsSync(filePath) || !filename.endsWith(".zip")) {
    return res.status(404).json({ success: false, error: "Backup file not found" });
  }
  
  fs.unlinkSync(filePath);
  res.json({ success: true, message: "Backup deleted successfully" });
});

module.exports = router;
