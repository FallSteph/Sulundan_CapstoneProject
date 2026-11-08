const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const archiver = require("archiver");
const Syllabus = require("../models/Syllabus");
const User = require("../models/User");
const fetch = require("node-fetch");
const { generateSyllabusTrackingId, generateEmployeeId } = require("../utils/idGenerator");

const uploadsDir = path.resolve(__dirname, "..", "uploads", "syllabi");

/**
 * Build the server base URL from the incoming request.
 * This ensures LAN clients (e.g. http://10.0.0.39:5000) get URLs they can
 * actually reach, instead of hardcoded http://localhost:PORT.
 */
function getBaseUrl(req) {
  if (req) {
    const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
    const host = req.headers["x-forwarded-host"] || req.headers["host"] || `localhost:${process.env.PORT || 5000}`;
    return `${proto}://${host}`;
  }
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}`;
}

async function scrubFile(filePath, translatePath, pyUrl) {
  if (!filePath || !fs.existsSync(filePath) || !filePath.toLowerCase().endsWith('.docx')) {
    return filePath;
  }
  try {
    const tempPath = filePath.replace('.docx', `_tmp_unsigned_${Date.now()}.docx`);
    fs.copyFileSync(filePath, tempPath);

    const containerPath = translatePath(tempPath);
    console.log(`[Scrub] Calling Python to remove signatures from ${containerPath}`);
    const pyRes = await fetch(`${pyUrl}/remove-signatures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: containerPath })
    });

    if (pyRes.ok) {
      const pyData = await pyRes.json();
      console.log(`[Scrub] Removed ${pyData.removed_count} signatures from ${containerPath}`);
      return tempPath;
    } else {
      console.warn(`[Scrub] Python failed for ${containerPath}: ${pyRes.statusText}`);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  } catch (err) {
    console.error(`[Scrub] Error scrubbing ${filePath}:`, err);
  }
  return filePath;
}

const translatePathGlobal = (hostPath) => {
  const backendRoot = path.resolve(__dirname, "..");
  const relative = path.relative(backendRoot, hostPath);
  return path.join("/backend", relative).replace(/\\/g, "/");
};

async function applyWatermark(filePath) {
  if (!filePath || !fs.existsSync(filePath) || !filePath.toLowerCase().endsWith('.docx')) return;
  try {
    const containerPath = translatePathGlobal(filePath);
    const pyUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";
    const res = await fetch(`${pyUrl}/add-watermark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: containerPath, text: "DRAFT" })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Watermark] Failed to add watermark to ${filePath}. Status: ${res.status}, Msg: ${errText}`);
    } else {
      console.log(`[Watermark] Successfully added watermark to ${filePath}`);
    }
  } catch (err) {
    console.error(`[Watermark] Error adding watermark to ${filePath}:`, err);
  }
}

async function removeWatermark(filePath) {
  if (!filePath || !fs.existsSync(filePath) || !filePath.toLowerCase().endsWith('.docx')) return;
  try {
    const containerPath = translatePathGlobal(filePath);
    const pyUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";
    const res = await fetch(`${pyUrl}/remove-watermark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: containerPath })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Watermark] Failed to remove watermark from ${filePath}. Status: ${res.status}, Msg: ${errText}`);
    } else {
      console.log(`[Watermark] Successfully removed watermark from ${filePath}`);
    }
  } catch (err) {
    console.error(`[Watermark] Error removing watermark from ${filePath}:`, err);
  }
}

try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch { }

function safeName(name, defaultExt = ".pdf") {
  if (!name) return `file_${Date.now()}${defaultExt}`;
  const ext = path.extname(name) || defaultExt;
  const base = path.basename(name, ext);
  return base
    .replace(/[\/\\]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 100) + ext;
}

const { createForAdmins, createForUser } = require("./notificationsController");
const Template = require("../models/Template");
const Semester = require("../models/Semester");

// DEBUG: inspect raw syllabus DB state (REMOVE IN PRODUCTION)
async function debugSyllabus(req, res) {
  try {
    const { id } = req.params;
    const doc = await Syllabus.findById(id).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json({
      id: String(doc._id),
      status: doc.status,
      current_stage: doc.current_stage,
      claimed_by_senior_faculty_id: doc.claimed_by_senior_faculty_id ? String(doc.claimed_by_senior_faculty_id) : null,
      claimed_by_senior_faculty_name: doc.claimed_by_senior_faculty_name,
      collaborators: (doc.collaborators || []).map(String),
      faculty_id: String(doc.faculty_id),
      assigned_peer_reviewers: (doc.assigned_peer_reviewers || []).map(a => ({
        reviewer_id: a.reviewer_id ? String(a.reviewer_id) : null,
        reviewer_name: a.reviewer_name,
        action: a.action,
        has_forwarded: a.has_forwarded
      })),
      review_history: (doc.review_history || []).map(rh => ({
        reviewer_id: rh.reviewer_id ? String(rh.reviewer_id) : null,
        reviewer_name: rh.reviewer_name,
        reviewer_role: rh.reviewer_role,
        action: rh.action,
        version: rh.version,
        timestamp: rh.timestamp
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function mapDbStatusToClient(dbStatus, currentStage) {
  if (dbStatus === "DRAFT") return "draft";
  if (dbStatus === "APPROVED") return "approved";
  if (dbStatus === "RETURNED") return "returned";
  if (dbStatus === "FOR_REVIEW") {
    switch (currentStage) {
      case "COLLABORATOR": return "submitted";   // awaiting collaborator review
      case "SENIOR_FACULTY": return "under_review_peer";
      case "DEPT_HEAD": return "under_review_dept_head";
      case "DEAN": return "under_review_dean";
      case "CITL": return "under_review_citl";
      case "VPAA": return "under_review_vpaa";
      default: return "submitted";
    }
  }
  return String(dbStatus || "").toLowerCase();
}

async function notifyReviewers(doc) {
  if (doc.status !== "FOR_REVIEW" || !doc.current_stage) return;

  // Handle specific peer reviewer assignment
  if (doc.current_stage === "SENIOR_FACULTY") {
    if (doc.claimed_by_senior_faculty_id) {
      try {
        const reviewer = await User.findById(doc.claimed_by_senior_faculty_id);
        if (reviewer && reviewer.is_active) {
          await createForUser(
            reviewer._id,
            "Syllabus Assigned for Peer Review",
            `A syllabus for ${doc.course_code} - ${doc.course_title} has been assigned to you for peer review.`,
            doc._id
          );
          return;
        }
      } catch (err) {
        console.error("[Syllabus] Error notifying assigned reviewer:", err);
      }
    } else if (doc.assigned_peer_reviewers && doc.assigned_peer_reviewers.length > 0) {
      try {
        for (const apr of doc.assigned_peer_reviewers) {
          const reviewer = await User.findById(apr.reviewer_id);
          if (reviewer && reviewer.is_active) {
            await createForUser(
              reviewer._id,
              "Syllabus Eligible for Peer Review",
              `A syllabus for ${doc.course_code} - ${doc.course_title} is ready for your peer review.`,
              doc._id
            );
          }
        }
        return;
      } catch (err) {
        console.error("[Syllabus] Error notifying assigned peer reviewers:", err);
      }
    } else {
      // No peer reviewer assigned/claimed — notify the faculty owner that it is now in the queue
      try {
        await createForUser(
          doc.faculty_id,
          "Syllabus in Peer Review Queue",
          `Your syllabus for ${doc.course_code} - ${doc.course_title} has been submitted and is now in the peer review queue, waiting for a Senior Faculty to claim it.`,
          doc._id
        );
      } catch (err) {
        console.error("[Syllabus] Error notifying faculty of peer review queue:", err);
      }
      // Fall through to broadcast to all available senior faculty in the department
    }
  }

  const stageMap = {
    SENIOR_FACULTY: { role: "FACULTY", label: "Peer Reviewer" },
    DEPT_HEAD: { role: "DEPT_HEAD", label: "Department Head" },
    DEAN: { role: "DEAN", label: "Dean" },
    CITL: { role: "CITL", label: "CITL" },
    VPAA: { role: "VPAA", label: "VPAA" }
  };

  const target = stageMap[doc.current_stage];
  if (!target) return;

  try {
    const isDeptScoped = target.role === "DEPT_HEAD" || doc.current_stage === "SENIOR_FACULTY";
    const unit = (isDeptScoped ? doc.department : doc.college) || "";
    const unitBase = unit.replace(/(Department of|College of|Dept of|Dept\.|College)\s+/gi, "").toLowerCase().trim();

    const reviewers = await User.find({ role: target.role, is_active: true });
    const targetReviewers = reviewers.filter(r => {
      // Exclude the author themselves from reviewing their own syllabus
      if (doc.current_stage === "SENIOR_FACULTY" && String(r._id) === String(doc.faculty_id)) return false;

      // University-wide roles don't need department/college unit filtering
      if (target.role === "CITL" || target.role === "VPAA") return true;

      const userUnit = (isDeptScoped ? r.department : r.college) || "";
      const userUnitBase = userUnit.replace(/(Department of|College of|Dept of|Dept\.|College)\s+/gi, "").toLowerCase().trim();

      if (!unitBase || !userUnitBase) return false;
      return userUnitBase.includes(unitBase) || unitBase.includes(userUnitBase);
    });

    if (targetReviewers.length === 0) {
      console.warn(`[Syllabus] No active ${target.label} found for unit: ${unit} (${unitBase})`);
    }

    const revTitle = "Syllabus Pending Review";
    const revMsg = `A syllabus for ${doc.course_code} - ${doc.course_title} is waiting for your review as ${target.label}.`;

    for (const rev of targetReviewers) {
      await createForUser(rev._id, revTitle, revMsg, doc._id);
    }
  } catch (err) {
    console.error("[Syllabus] Notification error:", err);
  }
}

async function createSyllabus(req, res) {
  try {
    const { facultyId, facultyName, facultyEmail, college, department, courseCode, courseTitle, fileName, fileData, semesterId, status, aiAnalysis } = req.body || {};

    // Map initial status/stage
    const mappedInitial = mapClientStatusToDb(status || "draft");
    const initialStatus = mappedInitial ? mappedInitial.status : "DRAFT";
    const initialStage = mappedInitial ? mappedInitial.currentStage : null;

    // Get current active semester from DB
    const currentSemester = await Semester.findOne({ isCurrent: true }).lean();
    if (!currentSemester) {
      console.error("[Syllabus] No current semester configured by Admin");
    }

    // Determine which semester to use:
    // 1. If semesterId is provided by frontend (meaning user manually selected one)
    // 2. Fallback to currentSemester from DB
    // 3. Fallback to req.body.semester string
    let finalSemester = req.body.semester || "";
    let finalSemesterId = semesterId || (currentSemester ? String(currentSemester._id) : "1");
    let finalAcademicYear = req.body.academicYear || "";

    if (semesterId) {
      // If semesterId was provided, try to fetch its details to get name/code
      try {
        const selectedSem = await Semester.findById(semesterId).lean();
        if (selectedSem) {
          finalSemester = selectedSem.name;
          finalAcademicYear = selectedSem.code;
        }
      } catch (err) {
        console.warn("[Syllabus] Provided semesterId not found, using defaults", err);
      }
    } else if (currentSemester) {
      finalSemester = currentSemester.name;
      finalAcademicYear = currentSemester.code;
    }

    if (!courseCode || !courseTitle || !finalSemester || !fileData) {
      return res.status(400).json({ success: false, error: "Missing required fields (courseCode, courseTitle, semester, or fileData)" });
    }

    // Determine extension from fileData header if possible
    let detectedExt = ".pdf";
    if (fileData.includes("wordprocessingml.document")) detectedExt = ".docx";
    else if (fileData.includes("msword")) detectedExt = ".doc";

    let user = null;
    if (facultyId) {
      try {
        user = await User.findById(facultyId).lean();
      } catch { }
    }
    if (!user && facultyEmail) {
      user = await User.findOne({ email: facultyEmail.toLowerCase() }).lean();
    }
    if (!user) {
      const name = String(facultyName || '').trim();
      const parts = name.split(/\s+/);
      const first = parts[0] || 'Faculty';
      const last = parts.slice(1).join(' ') || 'User';
      const email = (facultyEmail && facultyEmail.includes('@'))
        ? facultyEmail.toLowerCase()
        : `${first}.${last}.${Date.now()}@placeholder.local`.toLowerCase().replace(/\s+/g, '');
      const employeeId = await generateEmployeeId("FACULTY", false);
      const created = await User.create({
        employee_id: employeeId,
        first_name: first,
        last_name: last,
        email,
        role: "FACULTY",
        college: String(college || ""),
        department: String(department || ""),
        status: "ACTIVE",
        is_active: true,
      });
      user = await User.findById(created._id).lean();
    }
    if (typeof fileData !== "string" || !/^data:application\/(?:pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|msword);base64,/i.test(fileData)) {
      return res.status(400).json({ success: false, error: "fileData must be base64 data URL (.pdf or .docx/.doc)" });
    }
    const m = fileData.match(/^data:application\/(?:pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|msword);base64,(.+)$/i);
    if (!m) {
      return res.status(400).json({ success: false, error: "Unsupported fileData format" });
    }
    const baseBuffer = Buffer.from(m[1], "base64");
    const cleanName = safeName(fileName || `${courseCode}${detectedExt}`, detectedExt);
    const stamp = Date.now();
    const target = path.join(uploadsDir, `${stamp}-${cleanName}`);
    fs.writeFileSync(target, baseBuffer);

    // Add watermark if it's a draft/unapproved
    if (!(initialStatus === "APPROVED" || initialStage === "VPAA")) {
      await applyWatermark(target);
    }

    const doc = await Syllabus.create({
      faculty_id: user._id,
      college: String(college || user.college || ""),
      department: String(department || user.department || ""),
      course_code: String(courseCode),
      course_title: String(courseTitle),
      semester: String(finalSemester),
      semester_id: String(finalSemesterId),
      academic_year: finalAcademicYear ? String(finalAcademicYear) : undefined,
      file_path: target,
      review_history: initialStage === "SENIOR_FACULTY" ? [{
        reviewer_id: user._id,
        reviewer_name: `${user.first_name} ${user.last_name}`,
        reviewer_role: "FACULTY",
        action: "forwarded",
        comment: "Submitted for senior faculty review",
        timestamp: new Date(),
        version: 1
      }] : [],
      status: initialStatus,
      current_stage: initialStage,
      forwarded_to_senior_faculty_at: initialStage === "SENIOR_FACULTY" ? new Date() : undefined,
      aiAnalysis: aiAnalysis
    });

    // Generate stable IDs - use the same ID as the syllabus for both forms as requested
    doc.bundle_id = String(doc._id);
    doc.form17_id = String(doc._id);
    doc.form18_id = String(doc._id);

    // Generate sequential tracking ID (S001, S002, ...)
    try {
      doc.tracking_id = await generateSyllabusTrackingId();
    } catch (tidErr) {
      console.error("[Syllabus] Failed to generate tracking_id:", tidErr);
    }

    try {
      const formsDir = path.resolve(__dirname, "..", "uploads", "forms");
      if (!fs.existsSync(formsDir)) fs.mkdirSync(formsDir, { recursive: true });

      for (const tType of ["form17", "form18"]) {
        let templatePath = "";
        // 1. Try to find the explicitly marked "active" template in DB
        const active = await Template.findOne({ type: tType, is_active: true }).lean();

        if (active && active.file_path && fs.existsSync(active.file_path)) {
          templatePath = active.file_path;
        } else {
          // 2. Fallback: find the most recent file in the templates folder for this type
          const typeDir = path.resolve(__dirname, "..", "templates", tType);
          if (fs.existsSync(typeDir)) {
            const files = fs.readdirSync(typeDir).filter(f => /\.(docx|pdf)$/i.test(f)).sort((a, b) => {
              const sa = fs.statSync(path.join(typeDir, a)).mtimeMs;
              const sb = fs.statSync(path.join(typeDir, b)).mtimeMs;
              return sb - sa;
            });
            if (files[0]) templatePath = path.join(typeDir, files[0]);
          }
        }

        if (templatePath) {
          const ext = path.extname(templatePath) || ".docx";
          // Create a copy named after the syllabus ID
          const targetFileName = `${tType}_${doc._id}${ext}`;
          const targetPath = path.join(formsDir, targetFileName);

          try {
            fs.copyFileSync(templatePath, targetPath);
            if (tType === "form17") doc.form17_path = targetPath;
            else doc.form18_path = targetPath;
            console.log(`[Syllabus] Automatically attached ${tType} to ${doc._id}`);
          } catch (copyErr) {
            console.error(`[Syllabus] Failed to copy ${tType} template:`, copyErr);
          }
        }
      }
      await doc.save();
    } catch (err) {
      console.error("[Proactive Bundle Error]", err);
    }

    // If status is FOR_REVIEW, notify appropriate reviewer
    await notifyReviewers(doc);

    const base = getBaseUrl(res.req || req);

    if (global.io) {
      global.io.emit("update_syllabi");
    }

    return res.status(201).json({
      success: true,
      syllabus: {
        id: String(doc._id),
        trackingId: doc.tracking_id || "",
        bundleId: doc.bundle_id,
        form17Id: doc.form17_id,
        form18Id: doc.form18_id,
        facultyId: String(doc.faculty_id),
        courseCode: doc.course_code,
        courseTitle: doc.course_title,
        semester: doc.semester,
        academicYear: doc.academic_year || null,
        fileUrl: `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.file_path))}?t=${new Date(doc.updatedAt || Date.now()).getTime()}`,
        form17Link: doc.form17_path ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form17_path))}` : null,
        form18Link: doc.form18_path ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form18_path))}` : null,
        aiAnalysis: doc.aiAnalysis,
        status: mapDbStatusToClient(doc.status, doc.current_stage),
        currentStage: doc.current_stage,
        version: doc.version || 1,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to create syllabus" });
  }
}

async function listSyllabi(req, res) {
  try {
    const items = await Syllabus.find({}).sort({ createdAt: -1 }).lean();
    const facultyIds = [...new Set(items.map(i => String(i.faculty_id)).filter(Boolean))];
    const users = facultyIds.length > 0 ? await User.find({ _id: { $in: facultyIds } }, { first_name: 1, last_name: 1 }).lean() : [];
    const userMap = new Map(users.map(u => [String(u._id), `${u.first_name || ""} ${u.last_name || ""}`.trim()]));
    const mapped = items.map((doc) => {
      const facId = String(doc.faculty_id);
      const facName = userMap.get(facId) || "";
      const base = getBaseUrl(req);

      return {
        id: String(doc._id),
        trackingId: doc.tracking_id || "",
        bundleId: doc.bundle_id || String(doc._id),
        form17Id: doc.form17_id || `f17_${doc._id}`,
        form18Id: doc.form18_id || `f18_${doc._id}`,
        facultyId: facId,
        facultyName: facName,
        college: doc.college || "",
        department: doc.department || "",
        courseCode: doc.course_code,
        courseTitle: doc.course_title,
        semester: doc.semester,
        semesterId: doc.semester_id || "1",
        academicYear: doc.academic_year || null,
        openedBy: doc.opened_by ? doc.opened_by.map(id => String(id)) : [],
        status: mapDbStatusToClient(doc.status, doc.current_stage),
        currentStage: doc.current_stage,
        version: doc.version || 1,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        claimedBySeniorFacultyId: doc.claimed_by_senior_faculty_id ? String(doc.claimed_by_senior_faculty_id) : null,
        claimedBySeniorFacultyName: doc.claimed_by_senior_faculty_name || null,
        reviewHistory: Array.isArray(doc.review_history)
          ? doc.review_history.map(ra => ({
            id: String(ra._id || `${Date.now()}`),
            reviewerId: String(ra.reviewer_id || ""),
            reviewerName: ra.reviewer_name || "",
            reviewerRole: (() => {
              const m = { FACULTY: "faculty", SENIOR_FACULTY: "senior_faculty", DEPT_HEAD: "dept_head", DEAN: "dean", CITL: "citl", vpaa: "vpaa" };
              return (m[ra.reviewer_role] || "").toLowerCase();
            })(),
            action: ra.action,
            comment: ra.comment || undefined,
            timestamp: ra.timestamp || doc.updatedAt || new Date(),
            version: ra.version || 1,
          }))
          : [],
        versionHistory: Array.isArray(doc.versionHistory)
          ? doc.versionHistory.map(vh => ({
            version: vh.version,
            timestamp: vh.timestamp,
            fileUrl: `${base}/uploads/syllabi/${encodeURIComponent(path.basename(vh.file_path))}?t=${new Date(vh.timestamp || Date.now()).getTime()}`
          }))
          : [],
        fileUrl: doc.file_path
          ? `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.file_path))}?t=${new Date(doc.updatedAt || Date.now()).getTime()}`
          : null,
        form17Link: doc.form17_path
          ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form17_path))}`
          : null,
        form18Link: doc.form18_path
          ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form18_path))}`
          : null,
        form17Data: doc.form17Data || null,
        form18Data: doc.form18Data || null,
        forwardedToSeniorFacultyAt: doc.forwarded_to_senior_faculty_at,
        forwardedToDeptHeadAt: doc.forwarded_to_dept_head_at,
        forwardedToDeanAt: doc.forwarded_to_dean_at,
        forwardedToCITLAt: doc.forwarded_to_citl_at,
        forwardedToVPAAAt: doc.forwarded_to_vpaa_at,
        scannedFileLink: doc.scanned_file_path
          ? `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.scanned_file_path))}`
          : null,
        aiAnalysis: doc.aiAnalysis,
        assigned_peer_reviewers: Array.isArray(doc.assigned_peer_reviewers)
          ? doc.assigned_peer_reviewers.map(apr => ({
            reviewer_id: apr.reviewer_id ? String(apr.reviewer_id) : null,
            reviewer_name: apr.reviewer_name || "",
            has_forwarded: apr.has_forwarded || false,
            action: apr.action || null,
            comment: apr.comment || "",
            forwarded_at: apr.forwarded_at
          }))
          : [],
        collaborators: Array.isArray(doc.collaborators)
          ? doc.collaborators.map(id => String(id))
          : [],
      };
    });
    return res.json({ success: true, syllabi: mapped });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to load syllabi" });
  }
}

async function getSyllabus(req, res) {
  try {
    const { id } = req.params;
    let doc = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      doc = await Syllabus.findById(id).lean();
    }
    if (!doc) {
      doc = await Syllabus.findOne({ tracking_id: id }).lean();
    }
    if (!doc) {
      return res.status(404).json({ success: false, error: "Syllabus not found" });
    }

    let facName = "";
    if (doc.faculty_id) {
      const u = await User.findById(doc.faculty_id, { first_name: 1, last_name: 1 }).lean();
      if (u) {
        facName = `${u.first_name || ""} ${u.last_name || ""}`.trim();
      }
    }

    const base = getBaseUrl(req);
    const mapped = {
      id: String(doc._id),
      trackingId: doc.tracking_id || "",
      bundleId: doc.bundle_id || String(doc._id),
      form17Id: doc.form17_id || `f17_${doc._id}`,
      form18Id: doc.form18_id || `f18_${doc._id}`,
      facultyId: String(doc.faculty_id || ""),
      facultyName: facName,
      college: doc.college || "",
      department: doc.department || "",
      courseCode: doc.course_code,
      courseTitle: doc.course_title,
      semester: doc.semester,
      semesterId: doc.semester_id || "1",
      academicYear: doc.academic_year || null,
      openedBy: doc.opened_by ? doc.opened_by.map(i => String(i)) : [],
      status: mapDbStatusToClient(doc.status, doc.current_stage),
      currentStage: doc.current_stage,
      version: doc.version || 1,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      claimedBySeniorFacultyId: doc.claimed_by_senior_faculty_id ? String(doc.claimed_by_senior_faculty_id) : null,
      claimedBySeniorFacultyName: doc.claimed_by_senior_faculty_name || null,
      reviewHistory: Array.isArray(doc.review_history)
        ? doc.review_history.map(ra => ({
          id: String(ra._id || `${Date.now()}`),
          reviewerId: String(ra.reviewer_id || ""),
          reviewerName: ra.reviewer_name || "",
          reviewerRole: (() => {
            const m = { FACULTY: "faculty", SENIOR_FACULTY: "senior_faculty", DEPT_HEAD: "dept_head", DEAN: "dean", CITL: "citl", vpaa: "vpaa" };
            return (m[ra.reviewer_role] || "").toLowerCase();
          })(),
          action: ra.action,
          comment: ra.comment || undefined,
          timestamp: ra.timestamp || doc.updatedAt || new Date(),
          version: ra.version || 1,
        }))
        : [],
      versionHistory: Array.isArray(doc.versionHistory)
        ? doc.versionHistory.map(vh => ({
          version: vh.version,
          timestamp: vh.timestamp,
          fileUrl: `${base}/uploads/syllabi/${encodeURIComponent(path.basename(vh.file_path))}?t=${new Date(vh.timestamp || Date.now()).getTime()}`
        }))
        : [],
      fileUrl: doc.file_path
        ? `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.file_path))}?t=${new Date(doc.updatedAt || Date.now()).getTime()}`
        : null,
      form17Link: doc.form17_path
        ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form17_path))}`
        : null,
      form18Link: doc.form18_path
        ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form18_path))}`
        : null,
      form17Data: doc.form17Data || null,
      form18Data: doc.form18Data || null,
      forwardedToSeniorFacultyAt: doc.forwarded_to_senior_faculty_at,
      forwardedToDeptHeadAt: doc.forwarded_to_dept_head_at,
      forwardedToDeanAt: doc.forwarded_to_dean_at,
      forwardedToCITLAt: doc.forwarded_to_citl_at,
      forwardedToVPAAAt: doc.forwarded_to_vpaa_at,
      scannedFileLink: doc.scanned_file_path
        ? `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.scanned_file_path))}`
        : null,
      aiAnalysis: doc.aiAnalysis,
      assigned_peer_reviewers: Array.isArray(doc.assigned_peer_reviewers)
        ? doc.assigned_peer_reviewers.map(apr => ({
          reviewer_id: apr.reviewer_id ? String(apr.reviewer_id) : null,
          reviewer_name: apr.reviewer_name || "",
          has_forwarded: apr.has_forwarded || false,
          action: apr.action || null,
          comment: apr.comment || "",
          forwarded_at: apr.forwarded_at
        }))
        : [],
      collaborators: Array.isArray(doc.collaborators)
        ? doc.collaborators.map(id => String(id))
        : [],
    };
    return res.json({ success: true, syllabus: mapped });
  } catch (err) {
    console.error("[getSyllabus]", err);
    return res.status(500).json({ success: false, error: "Failed to get syllabus" });
  }
}

async function updateBundle(req, res) {
  try {
    const { id } = req.params;
    const { form17Id, form18Id } = req.body || {};
    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });
    doc.bundle_id = String(doc._id);
    if (form17Id) doc.form17_id = String(form17Id);
    if (form18Id) doc.form18_id = String(form18Id);
    await doc.save();
    return res.json({
      success: true,
      syllabus: {
        id: String(doc._id),
        bundleId: doc.bundle_id,
        form17Id: doc.form17_id || null,
        form18Id: doc.form18_id || null,
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to update bundle" });
  }
}

function mapClientStatusToDb(status) {
  // Map client flow statuses to DB status/current_stage
  // Returns { status, currentStage }
  switch (String(status || "").toLowerCase()) {
    case "draft":
      return { status: "DRAFT", currentStage: null };
    case "submitted":
      // Awaiting collaborator review — distinct from senior faculty review
      return { status: "FOR_REVIEW", currentStage: "COLLABORATOR" };
    case "under_review_peer":
    case "under_review_senior_faculty":
      return { status: "FOR_REVIEW", currentStage: "SENIOR_FACULTY" };
    case "under_review_dept_head":
      return { status: "FOR_REVIEW", currentStage: "DEPT_HEAD" };
    case "under_review_dean":
      return { status: "FOR_REVIEW", currentStage: "DEAN" };
    case "under_review_citl":
      return { status: "FOR_REVIEW", currentStage: "CITL" };
    case "under_review_vpaa":
      return { status: "FOR_REVIEW", currentStage: "VPAA" };
    case "approved":
      return { status: "APPROVED", currentStage: "VPAA" };
    case "returned":
      return { status: "RETURNED", currentStage: null };
    default:
      return null;
  }
}

async function updateSyllabus(req, res) {
  try {
    const { id } = req.params;
    const { status, reviewAction, assignedPeerReviewers } = req.body || {};
    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });

    // Only overwrite assigned_peer_reviewers from frontend when there is NO reviewAction
    // at the SENIOR_FACULTY stage. When a reviewAction IS present, the reviewAction handler
    // below will update the individual reviewer — this prevents race conditions where
    // two reviewers forward simultaneously and one's stale data overwrites the other's.
    const isPeerReviewAction = reviewAction && doc.current_stage === "SENIOR_FACULTY";
    if (assignedPeerReviewers && Array.isArray(assignedPeerReviewers) && !isPeerReviewAction) {
      doc.assigned_peer_reviewers = assignedPeerReviewers.map(apr => ({
        reviewer_id: apr.reviewerId || apr.reviewer_id,
        reviewer_name: apr.reviewerName || apr.reviewer_name,
        has_forwarded: apr.hasForwarded || apr.has_forwarded || false,
        action: apr.action || null,
        comment: apr.comment || "",
        forwarded_at: apr.forwardedAt || apr.forwarded_at || null
      }));
    }
    if (status) {
      // If we're in the SENIOR_FACULTY or COLLABORATOR stage, ignore status updates - let reviewAction handle it
      if (doc.current_stage !== "SENIOR_FACULTY" && doc.current_stage !== "COLLABORATOR") {
        const mapped = mapClientStatusToDb(status);
        if (!mapped) {
          return res.status(400).json({ success: false, error: "Invalid status" });
        }

        // Only increment version upon resubmission (when submitted for review after being returned)
        const wasDraftOrReturned = (doc.status === "DRAFT" || doc.status === "RETURNED");
        const willBeForReview = (mapped.status === "FOR_REVIEW");
        const hadPreviousReturn = doc.review_history && doc.review_history.some(r => r.action === "returned");

        if (willBeForReview && wasDraftOrReturned && hadPreviousReturn) {
          if (!doc.versionHistory) doc.versionHistory = [];
          const alreadyArchived = doc.versionHistory.some(vh => vh.version === (doc.version || 1));
          if (!alreadyArchived && doc.file_path) {
            doc.versionHistory.push({
              version: doc.version || 1,
              file_path: doc.file_path,
              timestamp: doc.updatedAt || new Date()
            });
          }
          doc.version = (doc.version || 1) + 1;
        }

        doc.status = mapped.status;
        if (mapped.currentStage) {
          // If the flow says to go to COLLABORATOR, check if there actually are any collaborators.
          // If not, skip directly to SENIOR_FACULTY.
          if (mapped.currentStage === "COLLABORATOR") {
            const hasCollaborators = doc.collaborators && Array.isArray(doc.collaborators) && doc.collaborators.length > 0;
            if (!hasCollaborators) {
              mapped.currentStage = "SENIOR_FACULTY";
            } else {
              // Save the selected senior faculty for LATER (after collaborators approve).
              // Do NOT put them in assigned_peer_reviewers yet — they shouldn't see the syllabus yet.
              if (assignedPeerReviewers && Array.isArray(assignedPeerReviewers) && assignedPeerReviewers.length > 0) {
                const sfr = assignedPeerReviewers[0];
                doc.claimed_by_senior_faculty_id = sfr.reviewerId || sfr.reviewer_id || null;
                doc.claimed_by_senior_faculty_name = sfr.reviewerName || sfr.reviewer_name || "";
              }
              // Clear assigned_peer_reviewers so the senior faculty can't see the syllabus yet
              doc.assigned_peer_reviewers = [];
            }
          }
          
          doc.current_stage = mapped.currentStage;

          // Update stage timestamps
          if (mapped.currentStage === "SENIOR_FACULTY") doc.forwarded_to_senior_faculty_at = new Date();
          else if (mapped.currentStage === "DEPT_HEAD") doc.forwarded_to_dept_head_at = new Date();
          else if (mapped.currentStage === "DEAN") doc.forwarded_to_dean_at = new Date();
          else if (mapped.currentStage === "CITL") doc.forwarded_to_citl_at = new Date();
          else if (mapped.currentStage === "VPAA") doc.forwarded_to_vpaa_at = new Date();
        }
      }
    }
    if (reviewAction && typeof reviewAction === "object") {
      const roleMap = { faculty: "FACULTY", faculty_peer_reviewer: "FACULTY", senior_faculty: "SENIOR_FACULTY", dept_head: "DEPT_HEAD", dean: "DEAN", citl: "CITL", vpaa: "VPAA" };
      const ra = {
        reviewer_id: reviewAction.reviewerId ? reviewAction.reviewerId : undefined,
        reviewer_name: reviewAction.reviewerName || "",
        reviewer_role: roleMap[reviewAction.reviewerRole] || null,
        action: reviewAction.action,
        comment: reviewAction.comment || undefined,
        timestamp: new Date(),
        version: doc.version || 1,
      };
      try {
        if (ra.reviewer_id && typeof ra.reviewer_id === "string") {
          ra.reviewer_id = ra.reviewer_id.match(/^[a-f0-9]{24}$/i) ? ra.reviewer_id : undefined;
        }
      } catch { }
      doc.review_history = Array.isArray(doc.review_history) ? doc.review_history : [];
      doc.review_history.push(ra);

      // Clear opened_by when there is a new review action/status change
      doc.opened_by = [];

      // Handle peer reviewer action
      if (doc.current_stage === "SENIOR_FACULTY" && ra.reviewer_id) {
        // Find the reviewer in assigned_peer_reviewers
        const reviewerIndex = doc.assigned_peer_reviewers.findIndex(
          apr => String(apr.reviewer_id) === String(ra.reviewer_id)
        );
        if (reviewerIndex !== -1) {
          doc.assigned_peer_reviewers[reviewerIndex].has_forwarded = ra.action === "forwarded";
          doc.assigned_peer_reviewers[reviewerIndex].action = ra.action;
          doc.assigned_peer_reviewers[reviewerIndex].comment = ra.comment || "";
          doc.assigned_peer_reviewers[reviewerIndex].forwarded_at = new Date();
        }

        // Check if all assigned peer reviewers have forwarded (and none have returned)
        if (doc.assigned_peer_reviewers.length > 0) {
          const allForwarded = doc.assigned_peer_reviewers.every(
            apr => apr.has_forwarded === true
          );
          if (allForwarded) {
            // Proceed to next stage (DEPT_HEAD)
            doc.status = "FOR_REVIEW";
            doc.current_stage = "DEPT_HEAD";
            doc.forwarded_to_dept_head_at = new Date();
          }

          // If any reviewer returned, return the syllabus
          const anyReturned = doc.assigned_peer_reviewers.some(
            apr => apr.action === "returned"
          );
          if (anyReturned) {
            doc.status = "RETURNED";
            doc.current_stage = null;
          }
        } else {
          // If no assigned peer reviewers, proceed to next stage as before
          doc.status = "FOR_REVIEW";
          doc.current_stage = "DEPT_HEAD";
          doc.forwarded_to_dept_head_at = new Date();
        }
      } else if (
        ra.reviewer_id &&
        doc.collaborators &&
        doc.collaborators.length > 0 &&
        doc.collaborators.map(String).includes(String(ra.reviewer_id)) &&
        String(ra.reviewer_id) !== String(doc.faculty_id) &&
        (doc.current_stage === "COLLABORATOR" || doc.current_stage === null || doc.status === "DRAFT")
      ) {
        // -----------------------------------------------------------------------
        // COLLABORATOR APPROVAL — detected by reviewer being in doc.collaborators
        // This handles: (a) normal COLLABORATOR stage, and (b) the edge case where
        // the syllabus is still DRAFT/null because the submit hasn't propagated yet
        // (race condition / backend restart between submit and collaborator approval).
        // -----------------------------------------------------------------------

        // Ensure stage is properly set (fix any stale DRAFT state)
        if (doc.status === "DRAFT" || doc.current_stage === null) {
          doc.status = "FOR_REVIEW";
          doc.current_stage = "COLLABORATOR";
        }

        if (ra.action === "returned") {
          // Any collaborator can return it
          doc.status = "RETURNED";
          doc.current_stage = null;
        } else if (ra.action === "forwarded") {
          // Count how many unique collaborators have approved (including this one, already pushed to history)
          const totalCollaborators = doc.collaborators ? doc.collaborators.length : 0;
          const collaboratorSet = new Set((doc.collaborators || []).map(String));
          const approvedSet = new Set();

          for (const rh of (doc.review_history || [])) {
            if (
              rh.action === "forwarded" &&
              rh.reviewer_id &&
              collaboratorSet.has(String(rh.reviewer_id)) &&
              String(rh.reviewer_id) !== String(doc.faculty_id)
            ) {
              approvedSet.add(String(rh.reviewer_id));
            }
          }

          console.log(`[Collaborator Approval] Syllabus ${doc._id}: ${approvedSet.size} of ${totalCollaborators} collaborators approved.`);

          if (totalCollaborators > 0 && approvedSet.size >= totalCollaborators) {
            console.log(`[Collaborator Approval] Syllabus ${doc._id}: All collaborators approved. Transitioning to SENIOR_FACULTY.`);
            doc.status = "FOR_REVIEW";
            doc.current_stage = "SENIOR_FACULTY";
            doc.forwarded_to_senior_faculty_at = new Date();
            
            if (doc.claimed_by_senior_faculty_id) {
              console.log(`[Collaborator Approval] Restoring senior faculty ${doc.claimed_by_senior_faculty_id} for Syllabus ${doc._id}`);
              doc.assigned_peer_reviewers = [{
                reviewer_id: doc.claimed_by_senior_faculty_id,
                reviewer_name: doc.claimed_by_senior_faculty_name || "",
                has_forwarded: false,
                action: null,
                comment: "",
                forwarded_at: null
              }];
            } else {
              console.log(`[Collaborator Approval] No claimed_by_senior_faculty_id for Syllabus ${doc._id}. Senior faculty must claim it.`);
              doc.assigned_peer_reviewers = [];
            }
          }
        }
      } else {
        // For other stages, proceed as before
        if (ra.action === "forwarded") {
          if (doc.current_stage === "DEPT_HEAD") {
            doc.current_stage = "DEAN";
            doc.forwarded_to_dean_at = new Date();
          } else if (doc.current_stage === "DEAN") {
            doc.current_stage = "CITL";
            doc.forwarded_to_citl_at = new Date();
          } else if (doc.current_stage === "CITL") {
            doc.current_stage = "VPAA";
            doc.forwarded_to_vpaa_at = new Date();
          } else if (doc.current_stage === "VPAA") {
            doc.status = "APPROVED";
          }
        } else if (ra.action === "returned") {
          doc.status = "RETURNED";
          doc.current_stage = null;
        } else if (ra.action === "approved") {
          doc.status = "APPROVED";
        }
      }

      // --- Notify users of updates ---
      const facultyTitle = "Syllabus Status Updated";
      let facultyMsg = "";
      const isApproved = doc.status === "APPROVED";
      const isReturned = doc.status === "RETURNED";

      if (isApproved) {
        facultyMsg = `Your syllabus for ${doc.course_code} - ${doc.course_title} has been fully approved!`;
      } else if (isReturned) {
        facultyMsg = `Your syllabus for ${doc.course_code} - ${doc.course_title} has been returned for revision. Feedback: ${ra.comment || "No comment provided"}`;
      } else if (doc.status === "FOR_REVIEW") {
        const stageLabel = { SENIOR_FACULTY: "Senior Faculty", DEPT_HEAD: "Dept Head", DEAN: "Dean", CITL: "CITL", VPAA: "VPAA" }[doc.current_stage] || doc.current_stage;
        facultyMsg = `Your syllabus for ${doc.course_code} - ${doc.course_title} has been forwarded to ${stageLabel} for review.`;
      }

      // If forwarded to CITL (meaning Dean level is passed), VPAA or fully APPROVED, remove watermark
      if (doc.status === "APPROVED" || doc.current_stage === "CITL" || doc.current_stage === "VPAA") {
        if (doc.file_path) {
          try {
            await removeWatermark(doc.file_path);
          } catch (err) {
            console.error("[Watermark Removal Error]", err);
          }
        }
      } else {
        // If it's returned or still in earlier stages (Dean, Dept Head, etc), ensure watermark is applied
        if (doc.file_path) {
          try {
            await applyWatermark(doc.file_path);
          } catch (err) {
            console.error("[Watermark Application Error]", err);
          }
        }
      }

      if (facultyMsg) {
        createForUser(doc.faculty_id, facultyTitle, facultyMsg, doc._id).catch(err => console.error("[Notification Error]", err));
        // Also notify collaborators of status changes
        if (Array.isArray(doc.collaborators) && doc.collaborators.length > 0) {
          for (const collabId of doc.collaborators) {
            createForUser(collabId, facultyTitle, facultyMsg.replace('Your syllabus', `A syllabus you are collaborating on (${doc.course_code})`).replace(`for ${doc.course_code}`, ''), doc._id).catch(err => console.error("[Collaborator Notification Error]", err));
          }
        }
      }

      // If forwarded to next stage, notify those reviewers
      notifyReviewers(doc).catch(err => console.error("[Reviewer Notification Error]", err));
    }
    await doc.save();

    if (global.io) {
      global.io.emit("update_syllabi");
    }

    const facId = String(doc.faculty_id);
    const user = await User.findById(facId).lean();
    const facName = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "";
    const base = getBaseUrl(req);
    const mapped = {
      id: String(doc._id),
      trackingId: doc.tracking_id || "",
      bundleId: doc.bundle_id || String(doc._id),
      form17Id: doc.form17_id || `f17_${doc._id}`,
      form18Id: doc.form18_id || `f18_${doc._id}`,
      facultyId: facId,
      facultyName: facName,
      college: doc.college || "",
      department: doc.department || "",
      courseCode: doc.course_code,
      courseTitle: doc.course_title,
      semester: doc.semester,
      semesterId: doc.semester_id || "1",
      academicYear: doc.academic_year || null,
      status: mapDbStatusToClient(doc.status, doc.current_stage),
      currentStage: doc.current_stage,
      version: doc.version || 1,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      claimedBySeniorFacultyId: doc.claimed_by_senior_faculty_id ? String(doc.claimed_by_senior_faculty_id) : null,
      claimedBySeniorFacultyName: doc.claimed_by_senior_faculty_name || null,
      collaborators: Array.isArray(doc.collaborators) ? doc.collaborators.map(String) : [],
      reviewHistory: Array.isArray(doc.review_history)
        ? doc.review_history.map(ra => ({
          id: String(ra._id || `${Date.now()}`),
          reviewerId: String(ra.reviewer_id || ""),
          reviewerName: ra.reviewer_name || "",
          reviewerRole: (() => {
            const m = { FACULTY: "faculty", SENIOR_FACULTY: "senior_faculty", DEPT_HEAD: "dept_head", DEAN: "dean", CITL: "citl", vpaa: "vpaa" };
            return (m[ra.reviewer_role] || "").toLowerCase();
          })(),
          action: ra.action,
          comment: ra.comment || undefined,
          timestamp: ra.timestamp || doc.updatedAt || new Date(),
          version: ra.version || 1,
        }))
        : [],
      versionHistory: Array.isArray(doc.versionHistory)
        ? doc.versionHistory.map(vh => ({
          version: vh.version,
          timestamp: vh.timestamp,
          fileUrl: `${base}/uploads/syllabi/${encodeURIComponent(path.basename(vh.file_path))}?t=${new Date(vh.timestamp || Date.now()).getTime()}`
        }))
        : [],
      fileUrl: doc.file_path
        ? `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.file_path))}?t=${new Date(doc.updatedAt || Date.now()).getTime()}`
        : null,
      form17Link: doc.form17_path
        ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form17_path))}`
        : null,
      form18Link: doc.form18_path
        ? `${base}/uploads/forms/${encodeURIComponent(path.basename(doc.form18_path))}`
        : null,
      form17Data: doc.form17Data || null,
      form18Data: doc.form18Data || null,
      forwardedToSeniorFacultyAt: doc.forwarded_to_senior_faculty_at,
      forwardedToDeptHeadAt: doc.forwarded_to_dept_head_at,
      forwardedToDeanAt: doc.forwarded_to_dean_at,
      forwardedToCITLAt: doc.forwarded_to_citl_at,
      forwardedToVPAAAt: doc.forwarded_to_vpaa_at,
      scannedFileLink: doc.scanned_file_path
        ? `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.scanned_file_path))}`
        : null,
      aiAnalysis: doc.aiAnalysis,
      assigned_peer_reviewers: Array.isArray(doc.assigned_peer_reviewers)
        ? doc.assigned_peer_reviewers.map(apr => ({
          reviewer_id: apr.reviewer_id ? String(apr.reviewer_id) : null,
          reviewer_name: apr.reviewer_name || "",
          has_forwarded: apr.has_forwarded || false,
          action: apr.action || null,
          comment: apr.comment || "",
          forwarded_at: apr.forwarded_at
        }))
        : [],
    };

    return res.json({ success: true, syllabus: mapped });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to update syllabus" });
  }
}

async function reuploadSyllabus(req, res) {
  try {
    const { id } = req.params;
    const { fileData, fileName, aiAnalysis } = req.body || {};
    if (!fileData) return res.status(400).json({ success: false, error: "Missing fileData" });

    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });

    // Determine extension
    let detectedExt = ".pdf";
    if (fileData.includes("wordprocessingml.document")) detectedExt = ".docx";
    else if (fileData.includes("msword")) detectedExt = ".doc";

    const m = fileData.match(/^data:application\/(?:pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|msword);base64,(.+)$/i);
    if (!m) return res.status(400).json({ success: false, error: "Unsupported fileData format" });

    const baseBuffer = Buffer.from(m[1], "base64");
    const cleanName = safeName(fileName || `${doc.course_code}_rev.pdf`, detectedExt);
    const target = path.join(uploadsDir, `${Date.now()}-${cleanName}`);
    fs.writeFileSync(target, baseBuffer);

    // Archive current version before updating
    if (!doc.versionHistory) doc.versionHistory = [];
    doc.versionHistory.push({
      version: doc.version || 1,
      file_path: doc.file_path,
      timestamp: doc.updatedAt || new Date()
    });

    doc.file_path = target;
    doc.version = doc.version || 1;
    doc.status = "DRAFT";
    doc.current_stage = null;
    if (aiAnalysis) doc.aiAnalysis = aiAnalysis;

    // Apply watermark on reupload
    await applyWatermark(target);

    // Clear signatures for the syllabus ONLY (keep form 17/18 signatures)
    if (doc.appliedSignatures && doc.appliedSignatures.length > 0) {
      doc.appliedSignatures = doc.appliedSignatures.filter(s => s.docType !== "syllabus");
    }

    await doc.save();

    if (global.io) {
      global.io.emit("update_syllabi");
    }

    const base = getBaseUrl(req);

    return res.json({
      success: true,
      syllabus: {
        id: String(doc._id),
        version: doc.version,
        fileUrl: `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.file_path))}?t=${new Date(doc.updatedAt || Date.now()).getTime()}`,
        status: mapDbStatusToClient(doc.status, doc.current_stage),
        currentStage: doc.current_stage,
        aiAnalysis: doc.aiAnalysis,
      }
    });
  } catch (err) {
    console.error("[Reupload Error]", err);
    return res.status(500).json({ success: false, error: "Failed to re-upload syllabus" });
  }
}

/**
 * POST /:id/new-version
 * Creates a new editable version of a RETURNED syllabus by copying the current file.
 * No file upload required — the existing docx is copied so the faculty can edit it in-place.
 * - Archives current file_path -> versionHistory
 * - Copies the file to a new path (so OnlyOffice has a fresh document to work on)
 * - Resets status to DRAFT, clears review/assignment state (version will increment upon resubmission)
 * - Keeps form17/form18 as-is
 */
async function newVersion(req, res) {
  try {
    const { id } = req.params;
    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });

    if (doc.status !== "RETURNED") {
      return res.status(400).json({ success: false, error: "Only returned syllabi can be revised this way" });
    }

    // Archive old file_path to versionHistory
    if (!doc.versionHistory) doc.versionHistory = [];
    if (doc.file_path) {
      doc.versionHistory.push({
        version: doc.version || 1,
        file_path: doc.file_path,
        timestamp: doc.updatedAt || new Date()
      });
    }

    // Copy the current file so the new version has its own file the editor can write to
    let newFilePath = doc.file_path; // fallback: reuse same path if copy fails
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      const ext = path.extname(doc.file_path) || ".docx";
      const baseName = `${doc.course_code || "syllabus"}_rev${ext}`;
      const copyTarget = path.join(uploadsDir, `${Date.now()}-${safeName(baseName, ext)}`);
      try {
        fs.copyFileSync(doc.file_path, copyTarget);
        newFilePath = copyTarget;

        const pyUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";
        const containerPath = translatePathGlobal(copyTarget);

        // Step 1: Remove all existing signatures from the copied file so it's clean
        try {
          const rmRes = await fetch(`${pyUrl}/remove-signatures`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_path: containerPath })
          });
          if (rmRes.ok) {
            console.log("[newVersion] Signatures removed from new copy.");
          } else {
            console.warn("[newVersion] Could not remove signatures:", await rmRes.text());
          }
        } catch (sigErr) {
          console.warn("[newVersion] remove-signatures call failed:", sigErr);
        }

        // Step 2: Apply fresh DRAFT watermark on the clean copy
        await applyWatermark(copyTarget);
      } catch (copyErr) {
        console.error("[newVersion] Failed to copy file:", copyErr);
      }
    }

    doc.file_path = newFilePath;
    doc.version = doc.version || 1;  // Keep version as-is; it increments only on re-submission
    doc.status = "RETURNED";         // Keep RETURNED so it stays in the returned tab until faculty submits again
    doc.current_stage = null;

    // Reset review/assignment state for the new version
    doc.claimed_by_senior_faculty_id = null;
    doc.claimed_by_senior_faculty_name = null;
    doc.assigned_peer_reviewers = [];
    doc.forwarded_to_senior_faculty_at = null;
    doc.forwarded_to_dept_head_at = null;
    doc.forwarded_to_dean_at = null;
    doc.forwarded_to_citl_at = null;
    doc.forwarded_to_vpaa_at = null;

    // Clear ALL applied signatures — the new copy is clean (signatures physically removed above)
    doc.appliedSignatures = [];

    await doc.save();

    if (global.io) global.io.emit("update_syllabi");

    const base = getBaseUrl(req);

    return res.json({
      success: true,
      syllabus: {
        id: String(doc._id),
        version: doc.version,
        status: mapDbStatusToClient(doc.status, doc.current_stage),
        fileUrl: doc.file_path
          ? `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.file_path))}?t=${Date.now()}`
          : null,
      }
    });
  } catch (err) {
    console.error("[newVersion]", err);
    return res.status(500).json({ success: false, error: "Failed to create new version" });
  }
}

async function uploadScanned(req, res) {
  try {
    const { id } = req.params;
    const { fileData, fileName } = req.body || {};
    if (!fileData) return res.status(400).json({ success: false, error: "Missing fileData" });

    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });

    // Determine extension
    let detectedExt = ".pdf";
    if (fileData.includes("wordprocessingml.document")) detectedExt = ".docx";
    else if (fileData.includes("msword")) detectedExt = ".doc";

    const m = fileData.match(/^data:application\/(?:pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|msword);base64,(.+)$/i);
    if (!m) return res.status(400).json({ success: false, error: "Unsupported fileData format" });

    const baseBuffer = Buffer.from(m[1], "base64");
    const cleanName = safeName(fileName || `${doc.course_code}_scanned.pdf`, detectedExt);
    const target = path.join(uploadsDir, `${Date.now()}-scanned-${cleanName}`);
    fs.writeFileSync(target, baseBuffer);

    doc.scanned_file_path = target;
    await doc.save();

    if (global.io) {
      global.io.emit("update_syllabi");
    }

    const base = getBaseUrl(req);

    return res.json({
      success: true,
      syllabus: {
        id: String(doc._id),
        scannedFileUrl: `${base}/uploads/syllabi/${encodeURIComponent(path.basename(doc.scanned_file_path))}`
      }
    });
  } catch (err) {
    console.error("[Scanned Upload Error]", err);
    return res.status(500).json({ success: false, error: "Failed to upload scanned syllabus" });
  }
}

async function downloadBulk(req, res) {
  try {
    const ids = req.method === 'POST' ? req.body.ids : req.query.ids;
    console.log(`[Bulk Download] Method: ${req.method}, Received IDs string:`, ids);

    if (!ids) return res.status(400).json({ success: false, error: "No IDs provided" });

    let idList = [];
    if (Array.isArray(ids)) {
      idList = ids.map(id => String(id).trim()).filter(id => mongoose.Types.ObjectId.isValid(id));
    } else {
      idList = ids.split(",").map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id));
    }

    console.log(`[Bulk Download] Processing ${idList.length} valid ObjectIds:`, idList);

    if (idList.length === 0) {
      return res.status(400).json({ success: false, error: "No valid IDs provided" });
    }

    // Populate faculty_id to get first_name and last_name
    const docs = await Syllabus.find({ _id: { $in: idList } }).populate("faculty_id", "first_name last_name");
    console.log(`[Bulk Download] Found ${docs.length} documents in database for the given IDs.`);

    if (docs.length === 0) {
      return res.status(404).json({ success: false, error: "No syllabi found in database for the provided IDs" });
    }

    const { unsigned } = req.query;
    const isUnsigned = unsigned === 'true';
    const pyUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    const backendRoot = path.resolve(__dirname, '..');
    const translatePath = (hostPath) => {
      const relative = path.relative(backendRoot, hostPath);
      return path.join('/backend', relative).replace(/\\/g, '/');
    };

    const docPaths = new Map(); // Store processed paths for each docId
    const validFiles = [];
    for (const doc of docs) {
      if (!doc.file_path) {
        console.warn(`[Bulk Download] Syllabus ${doc._id} has no file_path.`);
        continue;
      }

      // Try resolving the path in multiple ways to be robust against env changes
      let fullPath = "";
      const storedPath = doc.file_path;
      const fileName = path.basename(storedPath);

      // 1. Try absolute path as stored
      if (path.isAbsolute(storedPath) && fs.existsSync(storedPath)) {
        fullPath = storedPath;
      }
      // 2. Try relative to backend root (standard for current setup)
      else if (fs.existsSync(path.resolve(__dirname, "..", storedPath))) {
        fullPath = path.resolve(__dirname, "..", storedPath);
      }
      // 3. Try relative to backend/uploads/syllabi (if only filename was stored)
      else if (fs.existsSync(path.join(uploadsDir, fileName))) {
        fullPath = path.join(uploadsDir, fileName);
      }
      // 4. Try relative to backend/controllers (legacy fallback)
      else if (fs.existsSync(path.resolve(__dirname, storedPath))) {
        fullPath = path.resolve(__dirname, storedPath);
      }
      if (fullPath && fs.existsSync(fullPath)) {
        let finalPath = fullPath;
        let isTemp = false;

        if (isUnsigned) {
          try {
            // Scrub Syllabus, Form 17, and Form 18 in parallel to prevent timeouts
            const results = await Promise.all([
              scrubFile(fullPath, translatePath, pyUrl),
              scrubFile(doc.form17_path, translatePath, pyUrl),
              scrubFile(doc.form18_path, translatePath, pyUrl)
            ]);

            finalPath = results[0];
            const scrubbedForm17 = results[1];
            const scrubbedForm18 = results[2];

            isTemp = (finalPath !== fullPath);

            docPaths.set(String(doc._id), {
              syllabus: finalPath,
              form17: scrubbedForm17,
              form18: scrubbedForm18
            });

            // Track any temporary files for cleanup
            if (isTemp) validFiles.push({ path: finalPath, isTemp: true });
            if (scrubbedForm17 !== doc.form17_path) validFiles.push({ path: scrubbedForm17, isTemp: true });
            if (scrubbedForm18 !== doc.form18_path) validFiles.push({ path: scrubbedForm18, isTemp: true });
          } catch (scrubErr) {
            console.error(`[Bulk Download] Scrubbing failed for ${doc._id}, using originals:`, scrubErr);
            docPaths.set(String(doc._id), { syllabus: fullPath, form17: doc.form17_path, form18: doc.form18_path });
          }
        } else {
          docPaths.set(String(doc._id), { syllabus: fullPath, form17: doc.form17_path, form18: doc.form18_path });
        }

        const facultyName = doc.faculty_id ? `${doc.faculty_id.first_name || ''}_${doc.faculty_id.last_name || ''}` : 'Faculty';
        const cleanName = `${doc.course_code || 'COURSE'}_${facultyName.replace(/\s+/g, "_")}_${path.basename(doc.file_path)}`;
        validFiles.push({
          path: finalPath,
          name: cleanName.replace(/[^a-zA-Z0-9._-]/g, "_"),
          isTemp: false // isTemp already added above if true
        });
      } else {
        console.warn(`[Bulk Download] File not found on disk for Syllabus ${doc._id}. Stored path: ${storedPath}`);
      }
    }

    console.log(`[Bulk Download] Found ${validFiles.length} files physically present on disk.`);

    if (validFiles.length === 0) {
      console.error("[Bulk Download] No files found on disk for any of the requested IDs.");
      // If it's a POST request, we can return JSON. If it's a GET (direct link), we should probably send a more user-friendly error.
      if (!res.headersSent) {
        return res.status(404).json({
          success: false,
          error: "None of the requested files were found on the server disk. The files may have been deleted or moved."
        });
      }
      return;
    }

    res.setHeader("Content-Type", "application/zip");
    const zipName = idList.length === 1
      ? `${docs[0].course_code}_Package_${Date.now()}.zip`
      : `syllabi-bulk-${Date.now()}.zip`;
    res.setHeader("Content-Disposition", `attachment; filename=${zipName}`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    const archive = archiver("zip", { zlib: { level: 9 } });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error("[Bulk Download] Archiver error:", err);
      if (!res.headersSent) {
        res.status(500).send({ success: false, error: "ZIP creation failed: " + err.message });
      }
    });

    archive.pipe(res);

    for (const doc of docs) {
      const facultyName = doc.faculty_id ? `${doc.faculty_id.first_name || 'Faculty'}_${doc.faculty_id.last_name || ''}`.trim() : 'Faculty';
      const cleanFaculty = facultyName.replace(/[^a-zA-Z0-9_-]+/g, "_");
      const folderName = `${doc.course_code || 'COURSE'}_${cleanFaculty}`;
      const processedPaths = docPaths.get(String(doc._id)) || { syllabus: doc.file_path, form17: doc.form17_path, form18: doc.form18_path };

      const processedSyllabusPath = processedPaths.syllabus;

      // 1. Add Syllabus
      if (processedSyllabusPath && fs.existsSync(processedSyllabusPath)) {
        // Use the original filename in the ZIP folder
        archive.file(processedSyllabusPath, { name: path.join(folderName, path.basename(doc.file_path)) });
      }

      // 2. Add Form 17
      if (processedPaths.form17 && fs.existsSync(processedPaths.form17)) {
        archive.file(processedPaths.form17, { name: path.join(folderName, path.basename(doc.form17_path)) });
      }

      // 3. Add Form 18
      if (processedPaths.form18 && fs.existsSync(processedPaths.form18)) {
        archive.file(processedPaths.form18, { name: path.join(folderName, path.basename(doc.form18_path)) });
      }
    }

    await archive.finalize();
    console.log("[Bulk Download] Package ZIP finalized and sent successfully.");

    // Cleanup temporary files
    for (const f of validFiles) {
      if (f.isTemp && fs.existsSync(f.path)) {
        try {
          fs.unlinkSync(f.path);
          console.log(`[Bulk Download] Cleaned up temp file: ${f.path}`);
        } catch (err) {
          console.error(`[Bulk Download] Failed to cleanup temp file ${f.path}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[Bulk Download Catch]", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Internal server error during ZIP creation: " + err.message });
    }
  }
}

async function exportReports(req, res) {
  console.log("[Export Reports] Request received with query:", req.query);
  try {
    const { college, department, status, semesterId, format: exportFormat, search } = req.query;

    const query = {};
    if (college && college !== "all") query.college = college;
    if (department && department !== "all") query.department = department;
    if (status && status !== "all") {
      const mapped = mapClientStatusToDb(status);
      if (mapped) {
        query.status = mapped.status;
        if (mapped.currentStage) {
          query.current_stage = mapped.currentStage;
        }
      }
    }
    if (semesterId) query.semester_id = semesterId;

    console.log("[Export Reports] Running MongoDB query:", JSON.stringify(query));
    let docs = await Syllabus.find(query).sort({ createdAt: -1 }).populate("faculty_id", "first_name last_name");
    console.log(`[Export Reports] Found ${docs.length} documents.`);

    // Apply search filter if present
    if (search && search.trim()) {
      const q = search.toLowerCase();
      docs = docs.filter(doc => {
        const fName = doc.faculty_id ? `${doc.faculty_id.first_name || ''} ${doc.faculty_id.last_name || ''}`.toLowerCase() : '';
        const courseCode = (doc.course_code || '').toLowerCase();
        const courseTitle = (doc.course_title || '').toLowerCase();
        return fName.includes(q) || courseCode.includes(q) || courseTitle.includes(q);
      });
      console.log(`[Export Reports] Filtered to ${docs.length} documents after search.`);
    }

    const isExcel = exportFormat === 'excel';
    const isPdf = exportFormat === 'pdf';

    const ext = isExcel ? 'xlsx' : (isPdf ? 'pdf' : 'csv');
    const contentType = isExcel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : (isPdf ? "application/pdf" : "text/csv");
    const filename = `syllabus-report-${Date.now()}.${ext}`;

    if (isPdf) {
      console.warn("[Export Reports] PDF format requested but not yet implemented. Falling back to CSV.");
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    // Header row
    const headers = ["Faculty Name", "College", "Department", "Course Code", "Course Title", "Semester", "Status", "Last Updated"];

    let content = "";
    if (isExcel) {
      // For "Excel" we'll use a simple HTML table format which Excel opens perfectly as .xlsx
      content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Syllabus Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
        <body><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;

      for (const doc of docs) {
        try {
          const fName = doc.faculty_id ? `${doc.faculty_id.first_name || ''} ${doc.faculty_id.last_name || ''}`.trim() : 'Unknown';
          content += `<tr>
            <td>${String(fName)}</td>
            <td>${String(doc.college || '')}</td>
            <td>${String(doc.department || '')}</td>
            <td>${String(doc.course_code || '')}</td>
            <td>${String(doc.course_title || '')}</td>
            <td>${String(doc.semester || '')}</td>
            <td>${String(mapDbStatusToClient(doc.status, doc.current_stage) || '')}</td>
            <td>${doc.updatedAt ? doc.updatedAt.toISOString() : "N/A"}</td>
          </tr>`;
        } catch (rowErr) {
          console.error("[Export Reports] Error processing row:", rowErr, doc._id);
        }
      }
      content += '</tbody></table></body></html>';
    } else {
      // Standard CSV
      content = headers.join(",") + "\n";
      for (const doc of docs) {
        try {
          const fName = doc.faculty_id ? `${doc.faculty_id.first_name || ''} ${doc.faculty_id.last_name || ''}`.trim() : 'Unknown';
          const row = [
            `"${String(fName).replace(/"/g, '""')}"`,
            `"${String(doc.college || '').replace(/"/g, '""')}"`,
            `"${String(doc.department || '').replace(/"/g, '""')}"`,
            `"${String(doc.course_code || '').replace(/"/g, '""')}"`,
            `"${String(doc.course_title || '').replace(/"/g, '""')}"`,
            `"${String(doc.semester || '').replace(/"/g, '""')}"`,
            `"${String(doc.status || '').replace(/"/g, '""')}"`,
            `"${doc.updatedAt ? doc.updatedAt.toISOString() : "N/A"}"`
          ].join(",");
          content += row + "\n";
        } catch (rowErr) {
          console.error("[Export Reports] Error processing row:", rowErr, doc._id);
        }
      }
    }

    console.log(`[Export Reports] ${isExcel ? 'Excel' : 'CSV'} generation complete, sending response.`);
    return res.status(200).send(content);
  } catch (err) {
    console.error("[Export Error]", err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: "Failed to export report: " + err.message });
    }
  }
}

async function markOpened(req, res) {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: "Missing userId" });
    await Syllabus.findByIdAndUpdate(id, { $addToSet: { opened_by: userId } });
    return res.json({ success: true });
  } catch (err) {
    console.error("[markOpened]", err);
    return res.status(500).json({ success: false, error: "Failed to mark as opened" });
  }
}

async function updateCollaborators(req, res) {
  try {
    const { id } = req.params;
    const { collaboratorIds } = req.body; // array of user ID strings
    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });
    // Validate and convert to ObjectIds
    const mongoose = require("mongoose");
    const validIds = (collaboratorIds || [])
      .filter(cid => mongoose.Types.ObjectId.isValid(cid))
      .map(cid => new mongoose.Types.ObjectId(cid));

    // Find newly added collaborators (not in old list)
    const oldIds = (doc.collaborators || []).map(String);
    const newIds = validIds.map(String);
    const addedIds = newIds.filter(nid => !oldIds.includes(nid));

    doc.collaborators = validIds;
    await doc.save();

    // Notify newly added collaborators
    if (addedIds.length > 0) {
      const owner = await User.findById(doc.faculty_id).lean();
      const ownerName = owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() : 'A faculty';
      for (const addedId of addedIds) {
        createForUser(
          addedId,
          'Added as Collaborator',
          `${ownerName} has added you as a collaborator on the syllabus for ${doc.course_code} - ${doc.course_title}.`,
          doc._id
        ).catch(err => console.error("[Collaborator Notification Error]", err));
      }
    }

    if (global.io) global.io.emit("update_syllabi");
    return res.json({ success: true, collaborators: doc.collaborators.map(String) });
  } catch (err) {
    console.error("[updateCollaborators]", err);
    return res.status(500).json({ success: false, error: "Failed to update collaborators" });
  }
}

module.exports = {
  createSyllabus,
  listSyllabi,
  getSyllabus,
  updateBundle,
  updateSyllabus,
  reuploadSyllabus,
  newVersion,
  uploadScanned,
  downloadBulk,
  exportReports,
  saveAiAnalysis,
  claimSyllabus,
  markOpened,
  deleteSyllabus,
  updateCollaborators
};

async function claimSyllabus(req, res) {
  try {
    const { id } = req.params;
    const { seniorFacultyId, seniorFacultyName } = req.body || {};
    if (!seniorFacultyId || !seniorFacultyName) {
      return res.status(400).json({ success: false, error: "Missing seniorFacultyId or seniorFacultyName" });
    }
    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });
    if (doc.current_stage !== "SENIOR_FACULTY") {
      return res.status(400).json({ success: false, error: "Syllabus is not at the Senior Faculty stage" });
    }
    if (doc.claimed_by_senior_faculty_id) {
      return res.status(409).json({ success: false, error: "Syllabus already claimed by another reviewer" });
    }
    if (String(doc.faculty_id) === String(seniorFacultyId)) {
      return res.status(400).json({ success: false, error: "You cannot claim your own syllabus for review" });
    }
    doc.claimed_by_senior_faculty_id = seniorFacultyId;
    doc.claimed_by_senior_faculty_name = seniorFacultyName;
    await doc.save();
    if (global.io) global.io.emit("update_syllabi");
    return res.json({ success: true, claimedBy: seniorFacultyName });
  } catch (err) {
    console.error("[claimSyllabus]", err);
    return res.status(500).json({ success: false, error: "Failed to claim syllabus" });
  }
}

async function saveAiAnalysis(req, res) {
  try {
    const { id } = req.params;
    const { aiAnalysis } = req.body || {};
    if (!aiAnalysis) return res.status(400).json({ success: false, error: "Missing aiAnalysis" });

    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });

    doc.aiAnalysis = aiAnalysis;
    await doc.save();

    if (global.io) global.io.emit("update_syllabi");

    return res.json({ success: true, aiAnalysis: doc.aiAnalysis });
  } catch (err) {
    console.error("[saveAiAnalysis]", err);
    return res.status(500).json({ success: false, error: "Failed to save AI analysis" });
  }
}

async function deleteSyllabus(req, res) {
  try {
    const { id } = req.params;
    const doc = await Syllabus.findById(id);
    if (!doc) return res.status(404).json({ success: false, error: "Syllabus not found" });
    if (doc.status !== "DRAFT") {
      return res.status(400).json({ success: false, error: "Only draft syllabi can be deleted" });
    }
    
    await Syllabus.findByIdAndDelete(id);

    if (global.io) {
      global.io.emit("update_syllabi");
    }

    return res.json({ success: true, message: "Draft deleted successfully" });
  } catch (err) {
    console.error("[deleteSyllabus]", err);
    return res.status(500).json({ success: false, error: "Failed to delete syllabus" });
  }
}
