const fs = require("fs");
const path = require("path");
const Template = require("../models/Template");
const User = require("../models/User");
const { createForUser, sendEmail } = require("./notificationsController");

const templatesDir = path.resolve(__dirname, "..", "templates");
try {
  fs.mkdirSync(templatesDir, { recursive: true });
} catch (error) {
  console.error("Failed to create templates directory:", error);
}

function safeName(name) {
  return String(name || "")
    .replace(/[\/\\]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120) || "template.docx";
}

async function listTemplates(req, res) {
  try {
    const { type } = req.query;
    const q = {};
    if (type) q.type = String(type).toLowerCase();
    const items = await Template.find(q).sort({ is_active: -1, created_at: -1 }).lean();
    return res.json({
      success: true,
      templates: items.map(t => {
        const port = process.env.PORT || 5000;
        const base = `http://localhost:${port}`;
        
        let fileBasename = "";
        try {
          fileBasename = t.file_path ? path.basename(t.file_path) : (t.file_name || "template.docx");
        } catch (e) {
          fileBasename = t.file_name || "template.docx";
        }

        return {
          id: String(t._id),
          type: t.type,
          title: t.title,
          version: t.version,
          isActive: !!t.is_active,
          createdAt: t.created_at,
          url: `/templates/${encodeURIComponent(fileBasename)}`,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to load templates:", error);
    return res.status(500).json({ success: false, error: "Failed to load templates" });
  }
}

async function createTemplate(req, res) {
  try {
    const { type, title, fileName, fileData } = req.body || {};
    const tType = String(type || "").toLowerCase();
    
    console.log(`[Templates] Create request: ${tType}`);

    if (!["syllabus", "form17", "form18"].includes(tType)) {
      return res.status(400).json({ success: false, error: "Invalid type: " + tType });
    }

    if (!fileData || typeof fileData !== "string") {
      return res.status(400).json({ success: false, error: "fileData is required" });
    }

    // Use a more memory-efficient way to find the base64 payload
    const marker = ";base64,";
    const markerIndex = fileData.indexOf(marker);
    if (markerIndex === -1) {
      console.error("[Templates] Invalid file format: base64 marker not found in fileData. Data starts with:", fileData.substring(0, 100));
      return res.status(400).json({ success: false, error: "Invalid file format: base64 marker not found" });
    }
    const base64Data = fileData.substring(markerIndex + marker.length);
    const buffer = Buffer.from(base64Data, "base64");

    const cleanName = safeName(fileName || `${tType}.docx`);
    const subdir = path.join(templatesDir, tType);
    
    if (!fs.existsSync(subdir)) {
      fs.mkdirSync(subdir, { recursive: true });
    }

    const stamp = Date.now();
    const targetPath = path.join(subdir, `${stamp}-${cleanName}`);
    fs.writeFileSync(targetPath, buffer);
    console.log(`[Templates] File saved: ${targetPath}`);

    // Deactivate previous active templates of this type
    await Template.updateMany({ type: tType, is_active: true }, { $set: { is_active: false } });
    
    // Determine next version
    const latest = await Template.findOne({ type: tType }).sort({ version: -1 }).lean();
    const nextVersion = (latest && latest.version) ? (latest.version + 1) : 1;
    
    const doc = await Template.create({
      type: tType,
      title: String(title || "").trim() || `${tType.toUpperCase()} Template v${nextVersion}`,
      file_name: cleanName,
      file_path: targetPath,
      version: nextVersion,
      is_active: true,
      created_by: null
    });

    console.log(`[Templates] DB record created: ${doc._id}`);

    // Construct the public URL for the response FIRST
    const port = process.env.PORT || 5000;
    const base = `http://localhost:${port}`;
    const publicUrl = `/templates/${encodeURIComponent(path.basename(targetPath))}`;

    // Trigger notifications in the background
    (async () => {
      try {
        const roles = ["FACULTY", "DEPT_HEAD", "DEAN", "CITL", "VPAA"];
        const users = await User.find({ role: { $in: roles } }, { _id: 1, email: 1 }).lean();
        
        const notifTitle = "New Template Available";
        const notifMsg = `A new ${tType.toUpperCase()} template is now available: ${doc.title}`;

        for (const u of users) {
          createForUser(u._id, notifTitle, notifMsg, null, null, publicUrl).catch(() => {});
        }
      } catch (err) {
        console.error("[Templates] Notification background error:", err);
      }
    })();

    return res.status(201).json({
      success: true,
      template: {
        id: String(doc._id),
        type: doc.type,
        title: doc.title,
        version: doc.version,
        isActive: true,
        url: publicUrl,
        createdAt: doc.created_at
      },
    });
  } catch (error) {
    console.error("[Templates] CRITICAL ERROR during createTemplate:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal Server Error: " + (error.message || "Unknown error")
    });
  }
}

async function activateTemplate(req, res) {
  try {
    const { id } = req.params;
    const t = await Template.findById(id);
    if (!t) return res.status(404).json({ success: false, error: "Template not found" });
    await Template.updateMany({ type: t.type }, { $set: { is_active: false } });
    t.is_active = true;
    await t.save();
    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to activate template:", error);
    return res.status(500).json({ success: false, error: "Failed to activate template" });
  }
}

module.exports = { listTemplates, createTemplate, activateTemplate };
