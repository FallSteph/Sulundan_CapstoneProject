const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const mongoose = require('mongoose');

// List of all models in the system
const models = {
  User: require('../models/User'),
  Syllabus: require('../models/Syllabus'),
  Semester: require('../models/Semester'),
  Notification: require('../models/Notification'),
  ChangeRequest: require('../models/ChangeRequest'),
  Template: require('../models/Template')
};

/**
 * Creates a backup of the database and uploaded files.
 */
async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupsBaseDir = path.resolve(__dirname, '..', 'backups');
  const backupDir = path.join(backupsBaseDir, `backup-${timestamp}`);
  
  try {
    // Create base backups directory if it doesn't exist
    if (!fs.existsSync(backupsBaseDir)) {
      fs.mkdirSync(backupsBaseDir, { recursive: true });
    }
    // Create specific backup directory
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`[Backup] Starting backup at ${timestamp}...`);

    // 1. Backup Database (JSON export)
    const dbBackupDir = path.join(backupDir, 'database');
    fs.mkdirSync(dbBackupDir);

    for (const [modelName, model] of Object.entries(models)) {
      const data = await model.find({}).lean();
      fs.writeFileSync(
        path.join(dbBackupDir, `${modelName.toLowerCase()}.json`),
        JSON.stringify(data, null, 2)
      );
      console.log(`[Backup] Exported ${data.length} records from ${modelName}`);
    }

    // 2. Backup Uploads
    const uploadsDir = path.resolve(__dirname, '..', 'uploads');
    const signaturesDir = path.resolve(__dirname, '..', 'signatures');
    const templatesDir = path.resolve(__dirname, '..', 'templates');

    const archiveFile = path.join(backupDir, 'files_backup.zip');
    const output = fs.createWriteStream(archiveFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      if (fs.existsSync(uploadsDir)) archive.directory(uploadsDir, 'uploads');
      if (fs.existsSync(signaturesDir)) archive.directory(signaturesDir, 'signatures');
      if (fs.existsSync(templatesDir)) archive.directory(templatesDir, 'templates');

      archive.finalize();
    });

    console.log(`[Backup] Files archived successfully.`);

    // 3. Zip everything into one final backup file
    const finalZipFile = path.resolve(__dirname, '..', 'backups', `SULUNDAN_BACKUP_${timestamp}.zip`);
    const finalOutput = fs.createWriteStream(finalZipFile);
    const finalArchive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      finalOutput.on('close', resolve);
      finalArchive.on('error', reject);
      finalArchive.pipe(finalOutput);
      finalArchive.directory(backupDir, false);
      finalArchive.finalize();
    });

    // Cleanup: remove temporary backup directory
    fs.rmSync(backupDir, { recursive: true, force: true });

    console.log(`[Backup] COMPLETED: ${finalZipFile}`);
    return finalZipFile;

  } catch (error) {
    console.error(`[Backup] FAILED:`, error);
    // Cleanup if failed
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * Automatically delete old backups (keep last 7 days)
 */
async function cleanupOldBackups(daysToKeep = 7) {
  const backupsDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) return;

  const now = Date.now();
  const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(backupsDir);
  for (const file of files) {
    const filePath = path.join(backupsDir, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > maxAge) {
      fs.unlinkSync(filePath);
      console.log(`[Backup Cleanup] Deleted old backup: ${file}`);
    }
  }
}

module.exports = { runBackup, cleanupOldBackups };
