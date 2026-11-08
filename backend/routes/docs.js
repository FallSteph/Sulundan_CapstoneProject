const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const User = require("../models/User");
const Syllabus = require("../models/Syllabus");
const Template = require("../models/Template");

const fetch = require("node-fetch");
const { EventEmitter } = require("events");
const docEvents = new EventEmitter();

function getFrontendBase() {
  const clientUrl = (process.env.CLIENT_URL || "http://localhost:8080").trim();
  try {
    const u = new URL(clientUrl);
    // Ensure we use localhost for local development
    u.hostname = "localhost";
    return u.origin;
  } catch {
    return "http://localhost:8080";
  }
}

function getInternalBase(req) {
  const port = process.env.PORT || 5000;
  
  // 1. Priority: Environment variable
  const envUrl = (process.env.INTERNAL_BASE_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  
  // 2. Default: If we are on localhost, OnlyOffice (Docker) needs host.docker.internal
  // If we are on a real IP, OnlyOffice might need that IP or the public base
  const host = req.get("host") || "";
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `http://host.docker.internal:${port}`;
  }

  // Fallback to the public base if it's not localhost
  return getPublicBase(req);
}

function getPublicBase(req) {
  const port = process.env.PORT || 5000;
  const envUrl = (process.env.PUBLIC_BASE_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  
  const host = req.get("host");
  if (host) return `http://${host}`;

  return `http://localhost:${port}`;
}

function getCallbackBase(req) {
  const port = process.env.PORT || 5000;
  const envUrl = (process.env.CALLBACK_BASE_URL || "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  
  return getInternalBase(req);
}

function resolveAndHealPath(syllabus, field, subfolder) {
  let storedPath = syllabus[field];
  if (!storedPath) return null;

  const baseName = path.basename(storedPath);
  const localPath = path.resolve(__dirname, "..", "uploads", subfolder, baseName);
  
  // 1. ALWAYS prioritize the file in the current project's uploads directory.
  // This prevents issues when the database contains absolute paths pointing to an older copy of the project (e.g. 'ewans' instead of 'semiii').
  if (fs.existsSync(localPath)) {
    // If the stored path is different from the local path, heal it in the background
    if (storedPath !== localPath) {
      syllabus[field] = localPath;
      syllabus.save().catch(err => console.error(`[Heal Path Error] Failed to save syllabus ${syllabus._id}:`, err));
    }
    return localPath;
  }

  // 2. Fallback to the stored path if it's absolute and exists
  if (!path.isAbsolute(storedPath)) {
    storedPath = path.resolve(__dirname, "..", storedPath);
  }
  
  if (fs.existsSync(storedPath)) {
    return storedPath;
  }
  
  return null;
}

async function resolveDocInfo(id, docType, req) {
  // Returns { url, title, fileType, key }
  const syllabus = await Syllabus.findById(id);
  if (!syllabus) return null;

  const { version } = req.query;
  const base = getInternalBase(req);

  if (docType === "syllabus") {
    let filePath = resolveAndHealPath(syllabus, "file_path", "syllabi");
    let targetVersion = syllabus.version;

    if (version && parseInt(version) < syllabus.version) {
      const vEntry = (syllabus.versionHistory || []).find(v => v.version === parseInt(version));
      if (vEntry && vEntry.file_path) {
        let vPath = vEntry.file_path;
        if (!path.isAbsolute(vPath)) vPath = path.resolve(__dirname, "..", vPath);
        if (fs.existsSync(vPath)) {
          filePath = vPath;
          targetVersion = vEntry.version;
        } else {
          const baseName = path.basename(vPath);
          const localPath = path.resolve(__dirname, "..", "uploads", "syllabi", baseName);
          if (fs.existsSync(localPath)) {
            filePath = localPath;
            targetVersion = vEntry.version;
          }
        }
      }
    }

    if (filePath && fs.existsSync(filePath)) {
      const fileName = path.basename(filePath);
      const url = `${base}/uploads/syllabi/${encodeURIComponent(fileName)}`;
      const title = `[V${targetVersion}] ${fileName}`;
      const ext = (fileName.split(".").pop() || "").toLowerCase();
      const fileType = ["docx", "docm", "dotx", "doc"].includes(ext) ? "docx" : (ext === "pdf" ? "pdf" : "docx");
      // Stable but version-aware key
      const mtime = fs.statSync(filePath).mtimeMs;
      const keySource = `syllabus-${id}-v${targetVersion}-${filePath}-${mtime}`;
      const key = crypto.createHash("sha256").update(keySource).digest("hex").slice(0, 32);
      return { url, title, fileType, key, status: syllabus.status, current_stage: syllabus.current_stage };
    }
  } else if (docType === "form17" || docType === "form18") {
    const tType = docType;
    let customPath = resolveAndHealPath(syllabus, docType === "form17" ? "form17_path" : "form18_path", "forms");
    
    // Fallback proactive creation if not created at upload
    if (!customPath) {
      try {
        let templatePath = "";
        const active = await Template.findOne({ type: tType, is_active: true }).lean();
        if (active && active.file_path) {
          let tPath = active.file_path;
          if (!path.isAbsolute(tPath)) tPath = path.resolve(__dirname, "..", tPath);
          if (fs.existsSync(tPath)) {
            templatePath = tPath;
          } else {
            const baseName = path.basename(tPath);
            const localPath = path.resolve(__dirname, "..", "templates", tType, baseName);
            if (fs.existsSync(localPath)) templatePath = localPath;
          }
        }
        
        if (!templatePath) {
          // Fallback to latest in templates dir
          const dir = path.resolve(__dirname, "..", "templates", tType);
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => /\.docx$/i.test(f)).sort((a, b) => {
              const sa = fs.statSync(path.join(dir, a)).mtimeMs;
              const sb = fs.statSync(path.join(dir, b)).mtimeMs;
              return sb - sa;
            });
            if (files[0]) templatePath = path.join(dir, files[0]);
          }
        }

        if (templatePath) {
          const fileName = `${tType}_${id}_${Date.now()}.docx`;
          const formsDir = path.resolve(__dirname, "..", "uploads", "forms");
          if (!fs.existsSync(formsDir)) fs.mkdirSync(formsDir, { recursive: true });
          const targetPath = path.join(formsDir, fileName);
          fs.copyFileSync(templatePath, targetPath);
          
          if (docType === "form17") syllabus.form17_path = targetPath;
          else syllabus.form18_path = targetPath;
          await syllabus.save();
          customPath = targetPath;
          console.log(`[Proactive] Created ${tType} for syllabus ${id} from template ${templatePath}`);
        }
      } catch (err) {
        console.error(`[Proactive Error] Failed to create ${tType} copy:`, err);
      }
    }

    if (customPath && fs.existsSync(customPath)) {
      const fileName = path.basename(customPath);
      const url = `${base}/uploads/forms/${encodeURIComponent(fileName)}`;
      // Stable but version-aware key
      const mtime = fs.statSync(customPath).mtimeMs;
      const keySource = `${tType}-${id}-${customPath}-${mtime}`;
      const key = crypto.createHash("sha256").update(keySource).digest("hex").slice(0, 32);
      return { url, title: fileName, fileType: "docx", key, status: syllabus.status, current_stage: syllabus.current_stage };
    }
  }
  
  // Last resort: use sample files
  const fallback = getInternalBase(req);
  const sample = docType === "form17"
    ? `${fallback}/sample-files/form17.docx`
    : docType === "form18"
      ? `${fallback}/sample-files/form18.docx`
      : `${fallback}/sample-files/syllabus.docx`;
  const ext = (sample.split(".").pop() || "").toLowerCase();
  const key = crypto.createHash("sha256").update(`sample-${docType}-${id}`).digest("hex").slice(0, 32);
  const sampleFileType = ["docx", "docm", "dotx", "doc"].includes(ext) ? "docx" : (ext === "pdf" ? "pdf" : "docx");
  return { url: sample, title: path.basename(sample), fileType: sampleFileType, key, status: syllabus ? syllabus.status : undefined, current_stage: syllabus ? syllabus.current_stage : undefined };
}

function fileTypeFromUrl(url) {
  const ext = (url.split(".").pop() || "").toLowerCase();
  if (["docx", "docm", "dotx", "doc"].includes(ext)) return "docx";
  if (["xlsx", "xlsm", "xltx", "xls"].includes(ext)) return "xlsx";
  if (["pptx", "pptm", "potx", "ppt"].includes(ext)) return "pptx";
  if (ext === "pdf") return "pdf";
  return "docx";
}

router.get("/:id/onlyoffice-config", async (req, res) => {
  try {
    // Add headers to prevent caching of the config
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    const { mode = "edit", docType = "syllabus" } = req.query;
    const docInfo = await resolveDocInfo(req.params.id, String(docType), req);
    if (!docInfo) return res.status(404).json({ error: "Syllabus or document not found" });

    const { url: docUrl, title, key, fileType: infoFileType, status, current_stage } = docInfo;
    const fileType = infoFileType || fileTypeFromUrl(docUrl);
    
    // Determine documentType based on fileType
    let documentType = "word";
    if (["xlsx", "xlsm", "xltx", "xls"].includes(fileType)) documentType = "cell";
    else if (["pptx", "pptm", "potx", "ppt"].includes(fileType)) documentType = "slide";
    else if (fileType === "pdf") documentType = "pdf";

    const callbackBase = getCallbackBase(req);
    const callbackUrl = `${callbackBase}/docs/${req.params.id}/onlyoffice-callback?docType=${docType}`;
    const cfgBase = {
      document: {
        fileType,
        key,
        title,
        url: docUrl,
        permissions: {
          download: true,
          edit: mode === "edit" && fileType !== "pdf", // PDF is usually not editable in basic OnlyOffice
          print: true,
          comment: true,
        },
      },
      editorConfig: {
        mode: (mode === "edit" && fileType !== "pdf") ? "edit" : "view",
        callbackUrl,
        customization: {
          hideRightMenu: true,
          autosave: true,
          forcesave: true,
        },
      },
      documentType,
    };

    // Show DRAFT watermark until it reaches CITL; remove at CITL, VPAA, or fully approved.
    // For returned-for-revision syllabi the current_stage resets below CITL so the watermark reappears automatically.
    const showWatermark = !(status === "APPROVED" || current_stage === "CITL" || current_stage === "VPAA");
    
    if (showWatermark) {
      cfgBase.editorConfig.customization.watermark = {
        text: "DRAFT",
        diagonal: true,
        transparent: 0.3
      };
    }

    let cfg = { ...cfgBase };

    // Attach logged-in user identity so DocsAPI won't prompt for a display name
    let userInjected = false;
    try {
      const auth = String(req.headers.authorization || "").trim();
      if (auth.toLowerCase().startsWith("bearer ")) {
        const token = auth.slice(7).trim();
        const secret = process.env.JWT_SECRET || "dev_secret";
        const decoded = jwt.verify(token, secret);
        const userId = String(decoded.sub || "");
        if (userId) {
          const u = await User.findById(userId, { first_name: 1, last_name: 1, email: 1 }).lean();
          const name = u ? `${u.first_name || ""} ${u.last_name || ""}`.trim() || (u.email || "") : "";
          const idForDs = userId;
          cfg.editorConfig = {
            ...(cfg.editorConfig || {}),
            user: { id: idForDs, name: name || "Reviewer" },
          };
          userInjected = true;
        }
      }
    } catch {
    }
    if (!userInjected) {
      const headerId = String(req.headers["x-user-id"] || "").trim();
      const headerName = String(req.headers["x-user-name"] || "").trim();
      if (headerId || headerName) {
        cfg.editorConfig = {
          ...(cfg.editorConfig || {}),
          user: { id: headerId || "anonymous", name: headerName || "Reviewer" },
        };
      }
    }
    const secret = process.env.ONLYOFFICE_JWT_SECRET;
    if (secret && secret.trim()) {
      const alg = (process.env.JWT_ALG || "HS256").toUpperCase();
      const signOpts = { algorithm: alg, expiresIn: "10m" };

      // Sign the minimal payload as recommended by ONLYOFFICE:
      const payload = {
        document: cfg.document,
        editorConfig: cfg.editorConfig,
        documentType: cfg.documentType,
      };
      const token = jwt.sign(payload, secret.trim(), signOpts);
      
      cfg = {
        ...cfg,
        document: {
          ...(cfg.document || {}),
          token,
        },
        token,
        jwt: token,
        editorConfig: {
          ...(cfg.editorConfig || {}),
          token,
        },
      };
      return res.json(cfg);
    }
    return res.json(cfg);
  } catch (e) {
    return res.status(500).json({ error: "Failed to build ONLYOFFICE config" });
  }
});

router.post("/:id/apply-signature", async (req, res) => {
  try {
    const { id } = req.params;
    const { signatureUrl, searchText, docType = "syllabus", align } = req.body;

    if (!signatureUrl || !searchText) {
      return res.status(400).json({ success: false, error: "Missing signatureUrl or searchText" });
    }

    const syllabus = await Syllabus.findById(id);
    if (!syllabus) return res.status(404).json({ success: false, error: "Syllabus not found" });

    let targetPath = resolveAndHealPath(
      syllabus, 
      docType === "syllabus" ? "file_path" : (docType === "form17" ? "form17_path" : "form18_path"),
      docType === "syllabus" ? "syllabi" : "forms"
    );

    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, error: `Document file not found: ${docType}` });
    }

    // signatureUrl is like http://localhost:5000/signatures/sig_123.png
    const sigFileName = path.basename(signatureUrl);
    const sigPath = path.resolve(__dirname, "..", "signatures", sigFileName);

    if (!fs.existsSync(sigPath)) {
      return res.status(404).json({ success: false, error: "Signature file not found on server" });
    }

    // Translate host absolute paths to container-relative paths
    // Example: c:\Users\...\Shared\backend\uploads\syllabi\file.docx -> /backend/uploads/syllabi/file.docx
    const backendRoot = path.resolve(__dirname, "..");
    const translatePath = (hostPath) => {
      const relative = path.relative(backendRoot, hostPath);
      // Ensure we use forward slashes for the Linux container
      return path.join("/backend", relative).replace(/\\/g, "/");
    };

    const containerTargetPath = translatePath(targetPath);
    const containerSigPath = translatePath(sigPath);

    // FORCESAVE BEFORE APPLYING SIGNATURE
    const docInfo = await resolveDocInfo(id, docType, Object.assign({}, req, { query: { version: req.query.version } }));
    if (docInfo && docInfo.key) {
      try {
        const docServerUrl = (process.env.ONLYOFFICE_URL || "http://localhost:8089/").replace(/\/+$/, "");
        const cmdUrl = `${docServerUrl}/coauthoring/CommandService.ashx`;
        const payload = { c: "forcesave", key: docInfo.key, userdata: "forcesave_before_sign" };
        const secret = process.env.ONLYOFFICE_JWT_SECRET;
        if (secret) {
          payload.token = jwt.sign(payload, secret.trim(), { expiresIn: '10m' });
        }
        const cmdRes = await fetch(cmdUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (cmdRes.ok) {
          const cmdData = await cmdRes.json();
          // If error is 0, forcesave is initiated. We should wait for the callback (status 6 or 2).
          if (cmdData.error === 0) {
            console.log(`[Docs] Forcesave initiated for ${id}. Waiting for callback...`);
            await new Promise((resolve) => {
              const timer = setTimeout(() => {
                docEvents.off(`saved_${docInfo.key}`, resolve);
                console.log(`[Docs] Forcesave wait timed out for ${id} after 20s. Proceeding.`);
                resolve();
              }, 20000); // 20 sec timeout
              docEvents.once(`saved_${docInfo.key}`, () => {
                clearTimeout(timer);
                console.log(`[Docs] Forcesave finished for ${id}. Proceeding.`);
                resolve();
              });
            });
          } else {
             console.log(`[Docs] Forcesave returned no changes or error (${cmdData.error}) for ${id}. Proceeding.`);
          }
        }
      } catch (cmdErr) {
        console.error(`[Docs] Forcesave error:`, cmdErr);
      }
    }

    // Call Python service
    const pythonUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";
    console.log(`[Docs] Calling Python service: ${containerTargetPath} with ${containerSigPath}`);
    
    const pyRes = await fetch(`${pythonUrl}/insert-signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: containerTargetPath,
        signature_path: containerSigPath,
        search_text: searchText,
        doc_type: docType,
        align: align || "center"
      })
    });

    if (!pyRes.ok) {
      const errText = await pyRes.text();
      throw new Error(`Python service failed: ${errText}`);
    }

    const pyData = await pyRes.json();
    console.log(`[Docs] Signature applied successfully:`, pyData);
    
    // Track signatures to apply – start with the primary one
    const sigsToTrack = [{ searchText, align: align || "center" }];

    // BUSINESS RULE: For Revised Syllabi (V2+), auto-sign both Lead Faculty and Course Instructor
    if (docType === "syllabus" && syllabus.version > 1 && searchText === "Lead Faculty") {
      console.log(`[Docs] Detected revised syllabus (V${syllabus.version}). Auto-applying signature to Course Instructor too.`);
      try {
        const pyRes2 = await fetch(`${pythonUrl}/insert-signature`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_path: containerTargetPath,
            signature_path: containerSigPath,
            search_text: "Course Instructor",
            docType: docType,
            align: align || "center"
          })
        });
        if (pyRes2.ok) {
          sigsToTrack.push({ searchText: "Course Instructor", align: align || "center" });
        }
      } catch (dualErr) {
        console.error(`[Docs] Failed to apply dual signature to Course Instructor:`, dualErr);
      }
    }

    try {
      syllabus.appliedSignatures = syllabus.appliedSignatures || [];
      
      for (const track of sigsToTrack) {
        const existingIdx = syllabus.appliedSignatures.findIndex(
          s => s.searchText === track.searchText && s.docType === docType
        );
        
        const newSigData = {
          signatureUrl,
          searchText: track.searchText,
          docType,
          align: track.align,
          appliedAt: new Date()
        };

        if (existingIdx !== -1) {
          syllabus.appliedSignatures[existingIdx] = newSigData;
        } else {
          syllabus.appliedSignatures.push(newSigData);
        }
      }
      
      await syllabus.save();
    } catch (dbErr) {
      console.error("[Docs] Failed to track applied signature in DB:", dbErr);
    }
    
    return res.json({ success: true, ...pyData });
  } catch (err) {
    console.error("[Apply Signature Error]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/:id/onlyoffice-callback", async (req, res) => {
  try {
    const { status, url } = req.body;
    const { docType } = req.query;
    const { id } = req.params;

    if (status === 2 || status === 3 || status === 6) {
      if (url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to download file from OnlyOffice");
        const buffer = await response.buffer();

        const syllabus = await Syllabus.findById(id);
        if (!syllabus) return res.status(404).json({ error: "Syllabus not found" });

        let targetPath = "";
        if (docType === "syllabus") targetPath = syllabus.file_path;
        else if (docType === "form17") targetPath = syllabus.form17_path;
        else if (docType === "form18") targetPath = syllabus.form18_path;

        if (targetPath) {
          fs.writeFileSync(targetPath, buffer);
          console.log(`[OnlyOffice] Saved ${docType} for ${id} to ${targetPath} (status ${status})`);
          
          // Re-apply any signatures that might have been overwritten
          if ((status === 2 || status === 6)) {
            const backendRoot = path.resolve(__dirname, "..");
            const translatePath = (hostPath) => {
              const relative = path.relative(backendRoot, hostPath);
              return path.join("/backend", relative).replace(/\\/g, "/");
            };
            const containerTargetPath = translatePath(targetPath);
            const pythonUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

            // 1. Re-apply watermark logic
            if (docType === "syllabus") {
              try {
                const hasWatermark = !(syllabus.status === "APPROVED" || syllabus.current_stage === "CITL" || syllabus.current_stage === "VPAA");
                const endpoint = hasWatermark ? "add-watermark" : "remove-watermark";
                const body = hasWatermark ? { file_path: containerTargetPath, text: "DRAFT" } : { file_path: containerTargetPath };
                await fetch(`${pythonUrl}/${endpoint}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body)
                });
                console.log(`[Docs] Watermark logic applied (${endpoint}) after OnlyOffice overwrite`);
              } catch (err) {
                console.error(`[Docs] Failed to apply watermark logic after OnlyOffice overwrite:`, err);
              }
            }

            // 2. Re-apply signatures
            if (syllabus.appliedSignatures && syllabus.appliedSignatures.length > 0) {
              const sigsForDoc = syllabus.appliedSignatures.filter(s => s.docType === docType);
              if (sigsForDoc.length > 0) {
                console.log(`[Docs] Re-applying ${sigsForDoc.length} signatures to ${docType} after OnlyOffice overwrite`);

                // Clean existing programmatic signatures first to prevent duplication
                try {
                  await fetch(`${pythonUrl}/remove-signatures`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ file_path: containerTargetPath })
                  });
                } catch (err) {
                  console.error(`[Docs] Failed to clean signatures before re-applying:`, err);
                }

                for (const sig of sigsForDoc) {
                  const sigFileName = path.basename(sig.signatureUrl);
                  const sigPath = path.resolve(__dirname, "..", "signatures", sigFileName);
                  if (fs.existsSync(sigPath)) {
                    try {
                      await fetch(`${pythonUrl}/insert-signature`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          file_path: containerTargetPath,
                          signature_path: translatePath(sigPath),
                          search_text: sig.searchText,
                          doc_type: sig.docType,
                          align: sig.align || "center"
                        })
                      });
                    } catch (err) {
                      console.error(`[Docs] Failed to re-apply signature:`, err);
                    }
                  }
                }
              }
            }
          }
        }
      }
      // Notify any waiting /apply-signature calls
      if (req.body.key) {
        docEvents.emit(`saved_${req.body.key}`);
      }
    }
    return res.json({ error: 0 });
  } catch (e) {
    console.error("[OnlyOffice Callback Error]", e);
    return res.status(500).json({ error: 1 });
  }
});


router.get("/:id/extract-comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { docType = "syllabus" } = req.query;

    const syllabus = await Syllabus.findById(id);
    if (!syllabus) return res.status(404).json({ success: false, error: "Syllabus not found" });

    let filePath = resolveAndHealPath(
      syllabus,
      docType === "syllabus" ? "file_path" : (docType === "form17" ? "form17_path" : "form18_path"),
      docType === "syllabus" ? "syllabi" : "forms"
    );

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: `Document file not found: ${docType}` });
    }

    // -----------------------------------------------------------------------
    // Force-save via OnlyOffice Command Service so comments written during
    // the current editing session are flushed to the .docx file on disk.
    // -----------------------------------------------------------------------
    try {
      const mtime = fs.statSync(filePath).mtimeMs;
      const keySource = `${docType === "syllabus" ? "syllabus" : docType}-${id}-v${syllabus.version || 1}-${filePath}-${mtime}`;
      const docKey = crypto.createHash("sha256").update(keySource).digest("hex").slice(0, 32);

      const onlyofficeHost = (process.env.ONLYOFFICE_URL || "http://localhost:8089").replace(/\/+$/, "");
      const jwtSecret = process.env.JWT_SECRET || "N3kL9vT8rQ1sZ6wX2dF7bH4mY0pG5aK8";

      // Build JWT token for the command
      const commandPayload = { c: "forcesave", key: docKey };
      const token = jwt.sign(commandPayload, jwtSecret, { expiresIn: "5m" });

      const commandRes = await fetch(`${onlyofficeHost}/coauthoring/CommandService.ashx`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ ...commandPayload, token }),
      }).catch(() => null);

      if (commandRes && commandRes.ok) {
        // Give OnlyOffice time to write the file
        await new Promise(r => setTimeout(r, 3000));
        console.log(`[Extract Comments] Force-save triggered for key: ${docKey}`);
      } else {
        console.warn(`[Extract Comments] Force-save command failed or unavailable, proceeding with file on disk.`);
      }
    } catch (fsErr) {
      console.warn("[Extract Comments] Force-save error (non-fatal):", fsErr.message);
    }

    // Translate to container path for python-service
    const backendRoot = path.resolve(__dirname, "..");
    const relative = path.relative(backendRoot, filePath);
    const containerFilePath = path.join("/backend", relative).replace(/\\/g, "/");

    const pythonUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";
    const pyRes = await fetch(`${pythonUrl}/extract-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: containerFilePath })
    });

    if (!pyRes.ok) {
      const errText = await pyRes.text();
      throw new Error(`Python service failed: ${errText}`);
    }

    const pyData = await pyRes.json();
    return res.json(pyData);
  } catch (err) {
    console.error("[Extract Comments Error]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});


router.post("/:id/fill-form", async (req, res) => {
  try {
    const { id } = req.params;
    const { formType, formData } = req.body;

    if (!formType || !formData) {
      return res.status(400).json({ success: false, error: "Missing formType or formData" });
    }

    const syllabus = await Syllabus.findById(id);
    if (!syllabus) return res.status(404).json({ success: false, error: "Syllabus not found" });

    // 1. Save data to database
    if (formType === "form17") {
      syllabus.form17Data = formData;
      syllabus.markModified("form17Data");
    } else if (formType === "form18") {
      syllabus.form18Data = formData;
      syllabus.markModified("form18Data");
    }
    
    // 2. Prepare customPath copy if it doesn't exist or is stale
    let customPath = resolveAndHealPath(syllabus, formType === "form17" ? "form17_path" : "form18_path", "forms");
    if (!customPath) {
      // Find template
      let templatePath = "";
      const active = await Template.findOne({ type: formType, is_active: true }).lean();
      if (active && active.file_path && fs.existsSync(active.file_path)) {
        templatePath = active.file_path;
      } else {
        const dir = path.resolve(__dirname, "..", "templates", formType);
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter(f => /\.docx$/i.test(f)).sort((a, b) => {
            const sa = fs.statSync(path.join(dir, a)).mtimeMs;
            const sb = fs.statSync(path.join(dir, b)).mtimeMs;
            return sb - sa;
          });
          if (files[0]) templatePath = path.join(dir, files[0]);
        }
      }

      if (templatePath) {
        const fileName = `${formType}_${id}_${Date.now()}.docx`;
        const formsDir = path.resolve(__dirname, "..", "uploads", "forms");
        if (!fs.existsSync(formsDir)) fs.mkdirSync(formsDir, { recursive: true });
        const targetPath = path.join(formsDir, fileName);
        fs.copyFileSync(templatePath, targetPath);
        
        if (formType === "form17") syllabus.form17_path = targetPath;
        else syllabus.form18_path = targetPath;
        customPath = targetPath;
      }
    }

    if (!customPath || !fs.existsSync(customPath)) {
      return res.status(404).json({ success: false, error: "Form template copy could not be created/found" });
    }

    // 3. Determine the file path to send to the Python service.
    // Translate host absolute paths to container-relative paths
    const pythonUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";
    const backendRoot = path.resolve(__dirname, "..");
    const relative = path.relative(backendRoot, customPath);
    const targetFilePath = path.join("/backend", relative).replace(/\\/g, "/");

    // 4. Call Python service /fill-form
    const pyRes = await fetch(`${pythonUrl}/fill-form`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: targetFilePath,
        form_type: formType,
        form_data: formData
      })
    });

    if (!pyRes.ok) {
      const errText = await pyRes.text();
      throw new Error(`Python service failed: ${errText}`);
    }

    // Save changes to database
    await syllabus.save();

    // Notify other components via socket.io
    if (global.io) {
      global.io.emit("update_syllabi");
    }

    const port = process.env.PORT || 5000;
    const base = `http://localhost:${port}`;
    const form17Link = syllabus.form17_path
      ? `${base}/uploads/forms/${encodeURIComponent(path.basename(syllabus.form17_path))}`
      : null;
    const form18Link = syllabus.form18_path
      ? `${base}/uploads/forms/${encodeURIComponent(path.basename(syllabus.form18_path))}`
      : null;

    return res.json({ 
      success: true, 
      form17Data: syllabus.form17Data, 
      form18Data: syllabus.form18Data,
      form17Link,
      form18Link
    });
  } catch (error) {
    console.error("[Fill Form Error]", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to fill form document" });
  }
});

module.exports = router;

