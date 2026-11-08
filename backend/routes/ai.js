const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const extractor = new WordExtractor();
const fetch = require("node-fetch");
const http = require("http");
const https = require("https");
const PQueue = require("p-queue").default;
const pRetry = require("p-retry");

/* =====================================================
   AI REQUEST QUEUE & RETRY CONFIG
===================================================== */
// Global queue for AI requests to prevent 503s and handle high traffic
// Limiting concurrency to 2 by default for local LLMs, can be increased via env
const aiQueue = new PQueue({
  concurrency: parseInt(process.env.AI_CONCURRENCY) || 1,
  timeout: 120000 // 2-minute timeout per request
});

/**
 * Enhanced AI Request Handler with Queue and Exponential Backoff
 * Respects Retry-After header from Gemini 429 responses.
 * @param {Function} task - The async task to perform (returns the raw Response object)
 * @param {Object} options - Retry options
 */
async function executeAIRequest(task, options = {}) {
  const retryOptions = {
    retries: options.retries || 5,
    factor: 2,
    minTimeout: 8000,
    maxTimeout: 60000,
    onFailedAttempt: async (error) => {
      const waitMs = error.retryAfterMs || 0;
      const waitSec = waitMs > 0 ? ` Waiting ${Math.ceil(waitMs / 1000)}s (Retry-After).` : '';
      console.warn(`[AI Queue] Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Status: ${error.status || 'N/A'}.${waitSec}`);
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    },
    ...options
  };

  return aiQueue.add(() => pRetry(async () => {
    try {
      const result = await task();
      return result;
    } catch (err) {
      // For 429, read Retry-After and attach delay to error
      if (err.status === 429) {
        const retryAfterSec = err.retryAfter ? parseInt(err.retryAfter, 10) : 0;
        err.retryAfterMs = (isNaN(retryAfterSec) ? 0 : retryAfterSec) * 1000 || 15000;
        throw err;
      }
      // Abort retry for other 4xx client errors
      if (err.status && err.status >= 400 && err.status < 500) {
        throw new pRetry.AbortError(err);
      }
      throw err;
    }
  }, retryOptions));
}

// Safe async file delete – waits a tick for streams to close, never crashes the process
function safeUnlink(filePath) {
  if (!filePath) return;
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== "ENOENT") {
        console.warn(`[safeUnlink] Could not delete ${filePath}: ${err.code}`);
      }
    });
  }, 200);
}

/* =====================================================
   LONG REQUEST AGENTS
===================================================== */
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
const agent = (url) => url.startsWith("https") ? httpsAgent : httpAgent;

/* =====================================================
   MULTER CONFIG
===================================================== */
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }
});

/* =====================================================
  OPENAI-COMPATIBLE BASE (Local Model Gateway)
===================================================== */
const getOpenAIBase = () => (process.env.LLM_BASE || "http://localhost:9090").replace(/\/+$/, "");
const getOpenAIModel = () => process.env.OPENAI_MODEL || "llama3.1";
const getOpenAIKey = () => process.env.OPENAI_API_KEY || "";

const getHeaders = () => {
  const headers = { "Content-Type": "application/json" };
  const key = getOpenAIKey();
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }
  return headers;
};

const { extractTitle } = require("../utils/extractor/titleExtract");
const { extractCourseCode } = require("../utils/extractor/courseCode");
const { extractCollege } = require("../utils/extractor/college");
const { extractDepartment } = require("../utils/extractor/department");
const { extractSemester } = require("../utils/extractor/semester");
const { extractCourseTitle } = require("../utils/extractor/courseTitle");

router.post("/extract-all-fields", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractHeaderTextFromFile(filePath, req.file.mimetype);

    const [courseCode, college, department, courseTitle, semester] = await Promise.all([
      extractCourseCode(text),
      extractCollege(text),
      extractDepartment(text),
      extractCourseTitle(text),
      extractSemester(text),
    ]);

    res.json({
      courseCode: courseCode || null,
      college: college || null,
      department: department || null,
      courseTitle: courseTitle || null,
      semester: semester || null,
    });
  } catch (err) {
    console.error("All fields extraction error:", err);
    res.status(500).json({ error: "All fields extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});
const { extractNominalDuration } = require("../utils/extractor/nominalDuration");
const { extractPrerequisite } = require("../utils/extractor/prerequisite");
const { extractCourseDescription } = require("../utils/extractor/courseDescription");
const { extractCourseOutcomes } = require("../utils/extractor/courseOutcomes");
const { extractReferences } = require("../utils/extractor/references");
const { extractCourseCredit } = require("../utils/extractor/courseCredit");
const { extractGradingSystem } = require("../utils/extractor/gradingSystem");
const { extractPolicies } = require("../utils/extractor/policies");
const { extractRevisionHistory } = require("../utils/extractor/revisionHistory");

/* =====================================================
   EXTRACT ALL JSON OBJECTS (NDJSON SUPPORT)
===================================================== */
function extractAllJSON(raw) {
  if (!raw) throw new Error("Empty AI response");

  const objects = [];
  let cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const lines = cleaned.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      try {
        objects.push(JSON.parse(trimmed));
      } catch (e) {
        console.log("Skipping invalid JSON line:", trimmed);
      }
    }
  }

  if (objects.length === 0) {
    throw new Error("No valid JSON objects found");
  }
  return objects;
}

/* =====================================================
   TEXT EXTRACTION
===================================================== */
async function extractTextFromFile(filePath, mimeType) {
  let text = "";

  try {
    const doc = await extractor.extract(filePath);
    text = doc.getBody() || "";
  } catch (err) {
    console.warn("[extractTextFromFile] WordExtractor failed, falling back to mammoth:", err.message);
    if (mimeType.includes("word") || mimeType.includes("officedocument")) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || "";
    } else {
      throw new Error("Only .docx files are supported");
    }
  }

  if (!text.trim()) throw new Error("No text extracted from document");

  const normalized = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const lower = normalized.toLowerCase();
  let start = 0;

  // Try to find the "Course Outcomes" section first (it's usually before the table)
  const coIdx = lower.indexOf("course outcomes");
  const ltIdx = lower.indexOf("learning template");

  if (coIdx !== -1) {
    start = coIdx;
  } else if (ltIdx !== -1) {
    start = ltIdx;
  }

  let end = normalized.length;
  const endMarkers = ["final examination", "final exam"];
  for (const m of endMarkers) {
    const idx = lower.indexOf(m, start > 0 ? start : 0);
    if (idx !== -1) {
      end = idx + m.length;
      break;
    }
  }
  let focused = normalized.substring(start, end);
  if (focused.trim().length < 500) focused = normalized;
  const MAX = 32000;
  if (focused.length > MAX) focused = focused.substring(0, MAX);
  text = focused;

  return text;
}

async function extractHeaderTextFromFile(filePath, mimeType) {
  let text = "";
  try {
    const doc = await extractor.extract(filePath);
    text = doc.getBody() || "";
  } catch (err) {
    console.warn("[extractHeaderTextFromFile] WordExtractor failed, falling back to mammoth:", err.message);
    if (mimeType.includes("word") || mimeType.includes("officedocument")) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || "";
    } else {
      throw new Error("Only .docx files are supported");
    }
  }
  if (!text.trim()) throw new Error("No text extracted from document");
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const lines = normalized.split("\n").map(l => l.trim()).filter(Boolean);
  const head = lines.slice(0, 100).join("\n");
  return head;
}

async function extractFullTextFromFile(filePath, mimeType) {
  let text = "";
  try {
    const doc = await extractor.extract(filePath);
    text = doc.getBody() || "";
  } catch (err) {
    console.warn("[extractFullTextFromFile] WordExtractor failed, falling back to mammoth:", err.message);
    if (mimeType.includes("word") || mimeType.includes("officedocument")) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || "";
    } else {
      throw new Error("Only .docx files are supported");
    }
  }
  if (!text.trim()) throw new Error("No text extracted from document");
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return normalized;
}

router.post("/extract-title", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    // For title detection, inspect the header area (not the learning template region)
    const text = await extractHeaderTextFromFile(filePath, req.file.mimetype);
    const title = extractTitle(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ title: title || null, status: title ? "passes" : "missing" });
  } catch (err) {
    console.error("Title extraction error:", err);
    res.status(500).json({ error: "Title extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-course-title", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const title = extractCourseTitle(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ courseTitle: title || null, status: title ? "passes" : "missing" });
  } catch (err) {
    console.error("Course title extraction error:", err);
    res.status(500).json({ error: "Course title extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-course-credit", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const credit = extractCourseCredit(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ courseCredit: credit || null, status: credit ? "passes" : "missing" });
  } catch (err) {
    console.error("Course credit extraction error:", err);
    res.status(500).json({ error: "Course credit extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-nominal-duration", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const duration = extractNominalDuration(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ nominalDuration: duration || null, status: duration ? "passes" : "missing" });
  } catch (err) {
    console.error("Nominal duration extraction error:", err);
    res.status(500).json({ error: "Nominal duration extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-prerequisite", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const prereq = extractPrerequisite(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ prerequisite: prereq || "N/A", status: "passes" });
  } catch (err) {
    console.error("Prerequisite extraction error:", err);
    res.status(500).json({ error: "Prerequisite extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-course-description", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const desc = extractCourseDescription(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ courseDescription: desc || null, status: desc ? "passes" : "missing" });
  } catch (err) {
    console.error("Course description extraction error:", err);
    res.status(500).json({ error: "Course description extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-course-outcomes", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const result = extractCourseOutcomes(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(result);
  } catch (err) {
    console.error("Course outcomes extraction error:", err);
    res.status(500).json({ error: "Course outcomes extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-references", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const result = extractReferences(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "References extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-grading-system", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const result = extractGradingSystem(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Grading system extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-policies", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const result = extractPolicies(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Policies extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-revision-history", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractFullTextFromFile(filePath, req.file.mimetype);
    const result = extractRevisionHistory(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Revision history extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

/* =====================================================
   PROMPT TEMPLATE – WITH STRONGER INSTRUCTION
===================================================== */
function buildPrompt(text) {
  return `
Directly output JSON objects (one per line) for Course Outcomes (COs), Specific Learning Outcomes (SLOs), and GAD (Gender and Development) analysis.
Scan the "Course Outcomes" section list (outside the table) AND the "Course Outcomes" and "Specific Learning Outcomes" columns (inside the table).
STRICTLY IGNORE all other columns, headers, topics, weeks, or citations except when analyzing GAD relevance.
NO preamble, NO explanations, NO markdown, NO additional text.

RULES:
1. **Focus**: Extract Course Outcomes (CO descriptions), Specific Learning Outcomes (SLOs), and GAD analysis.
2. **SLO Extraction (CRITICAL)**: SLOs must be extracted **ONLY** from the column titled **"Specific Learning Outcomes"** inside the "Learning Template" table.
3. **Ignore All Else**: DO NOT extract topics, week numbers, module titles, book references, software tools, or assessment methods. If it doesn't start with a clear action verb (e.g., "Describe", "Apply", "Analyze"), IGNORE IT.
4. **Exhaustive Extraction**: For each CO (CO1, CO2, etc.), you MUST find and extract **EVERY SINGLE** SLO associated with it. If a CO spans multiple rows or weeks, continue collecting SLOs until the next CO code appears.
5. **No Omissions/Summaries**: It is critical that NO Specific Learning Outcome is missed. If a CO has 3, 5, 10, or more SLOs, you must capture ALL of them exactly as written. DO NOT summarize. DO NOT truncate.
6. **Sequential Grouping**: Collect SLOs row-by-row in their exact order. Assign all SLOs to the current CO until a new CO code (e.g., CO2) is explicitly named in the "Course Outcomes" column.
7. **No Duplication**: If the same SLO text is repeated across multiple rows for the SAME CO, only include it ONCE in the 'slos' array.
8. **Split Multiple SLOs**: If a single cell contains multiple bullet points or sentences, split them into separate SLO strings.
9. **First-Verb Rule**: Bloom's Taxonomy level is determined EXCLUSIVELY by the first verb of the CO or SLO.
10. **GAD Analysis (VERY IMPORTANT)**: For EVERY CO and EVERY SLO, carefully analyze if it relates to Gender and Development (GAD). GAD-related topics include: gender equality, women's empowerment, gender sensitivity, inclusive education, gender mainstreaming, addressing gender-based discrimination, promoting gender equity, equal opportunities for all genders, etc. If the CO or SLO relates to any of these topics, set isGadRelated to true and provide a short explanation (1-2 sentences). Otherwise, set isGadRelated to false and explanation to empty string.
11. **JSON Formats**:
   - CO: {"type":"co","coCode":"CO1","coDescription":"Full CO text","slos":["SLO 1","SLO 2"]}
   - Bloom: {"type":"bloom","coCode":"CO1","slo":"SLO text (or null for CO)","level":"LevelName"}
   - GAD: {"type":"gad","coCode":"CO1","slo":"SLO text (or null for CO)","isGadRelated":true/false,"explanation":"Small explanation if relevant"}
EXAMPLE:
{"type":"co","coCode":"CO2","coDescription":"analyze the roles of stakeholders and constraints in multimedia project execution","slos":["Identify key stakeholders involved in a multimedia project","Explain the impact of project constraints on production decisions","Compare different stakeholder roles in project scenarios"]}
{"type":"bloom","coCode":"CO2","slo":null,"level":"Analyzing"}
{"type":"bloom","coCode":"CO2","slo":"Identify key stakeholders involved in a multimedia project","level":"Remembering"}
{"type":"bloom","coCode":"CO2","slo":"Explain the impact of project constraints on production decisions","level":"Understanding"}
{"type":"bloom","coCode":"CO2","slo":"Compare different stakeholder roles in project scenarios","level":"Analyzing"}
{"type":"gad","coCode":"CO2","slo":null,"isGadRelated":false,"explanation":""}
{"type":"gad","coCode":"CO2","slo":"Identify key stakeholders involved in a multimedia project","isGadRelated":false,"explanation":""}

Syllabus Text:
${text}
`;
}


/* =====================================================
   BLOOM TAXONOMY HELPER
===================================================== */
function getBloomLevelFromFirstVerb(sentence) {
  if (!sentence) return "Unknown";

  // Extract the first word (primary verb)
  // Improved to handle bullets like "•", "-", "1.", etc.
  const cleanedSentence = sentence.trim().replace(/^[•\-\d\.]+\s*/, "");
  const firstWord = cleanedSentence.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");

  const mapping = {
    // Remembering
    define: "Remembering", list: "Remembering", identify: "Remembering", recall: "Remembering",
    recognize: "Remembering", state: "Remembering", name: "Remembering", label: "Remembering",
    match: "Remembering", repeat: "Remembering", reproduce: "Remembering", select: "Remembering",
    memorize: "Remembering", enumerate: "Remembering", describe: "Remembering", outline: "Remembering",

    // Understanding
    explain: "Understanding", summarize: "Understanding", interpret: "Understanding",
    classify: "Understanding", discuss: "Understanding", illustrate: "Understanding",
    paraphrase: "Understanding", infer: "Understanding", predict: "Understanding",
    associate: "Understanding", estimate: "Understanding", clarify: "Understanding",
    translate: "Understanding", exemplify: "Understanding",

    // Applying
    apply: "Applying", use: "Applying", demonstrate: "Applying", implement: "Applying",
    execute: "Applying", solve: "Applying", perform: "Applying", manipulate: "Applying",
    measure: "Applying", relate: "Applying", show: "Applying", prepare: "Applying",
    compute: "Applying", operate: "Applying", practice: "Applying", carry: "Applying",

    // Analyzing
    analyze: "Analyzing", differentiate: "Analyzing", organize: "Analyzing",
    examine: "Analyzing", investigate: "Analyzing", categorize: "Analyzing",
    distinguish: "Analyzing", compare: "Analyzing", contrast: "Analyzing",
    deconstruct: "Analyzing", structure: "Analyzing",
    dissect: "Analyzing", break: "Analyzing",

    // Evaluating
    evaluate: "Evaluating", assess: "Evaluating", justify: "Evaluating",
    critique: "Evaluating", defend: "Evaluating", argue: "Evaluating",
    validate: "Evaluating", recommend: "Evaluating", support: "Evaluating",
    appraise: "Evaluating", criticize: "Evaluating", judge: "Evaluating",
    prioritize: "Evaluating", rate: "Evaluating", verify: "Evaluating",

    // Creating
    create: "Creating", design: "Creating", develop: "Creating", construct: "Creating",
    formulate: "Creating", build: "Creating", compose: "Creating", produce: "Creating",
    assemble: "Creating", devise: "Creating", generate: "Creating", plan: "Creating",
    propose: "Creating", rearrange: "Creating", invent: "Creating", synthesize: "Creating",
    integrate: "Creating"
  };

  return mapping[firstWord] || "Unknown";
}

/* =====================================================
   POST-PROCESSING: ENSURE EVERY SLO HAS A BLOOM OBJECT
===================================================== */
function ensureCompleteBloomData(coAlignment, bloomData) {
  const bloomMap = new Map();

  // Use a Map to deduplicate based on (coCode, slo) or (coCode, CO_LEVEL)
  bloomData.forEach(b => {
    // Re-process AI-assigned levels if a known verb is found at the start
    let text = b.slo || "";
    if (!text) {
      const co = coAlignment.find(c => c.coCode === b.coCode);
      if (co) text = co.coDescription;
    }

    if (text) {
      const detectedLevel = getBloomLevelFromFirstVerb(text);
      if (detectedLevel !== "Unknown") {
        b.level = detectedLevel;
      }
    }

    const key = b.slo ? `${b.coCode}||${b.slo}` : `${b.coCode}||CO_LEVEL`;
    // Only set if not already present, effectively deduplicating
    if (!bloomMap.has(key)) {
      bloomMap.set(key, b);
    }

    // Ensure SLO is in coAlignment if it's a bloom object for an SLO
    if (b.slo) {
      const co = coAlignment.find(c => c.coCode === b.coCode);
      if (co && !co.slos.includes(b.slo)) {
        co.slos.push(b.slo);
      }
    }
  });

  coAlignment.forEach(co => {
    // 1. Ensure CO itself has a bloom object
    const coKey = `${co.coCode}||CO_LEVEL`;
    if (!bloomMap.has(coKey)) {
      const level = getBloomLevelFromFirstVerb(co.coDescription);
      bloomMap.set(coKey, {
        type: "bloom",
        coCode: co.coCode,
        level: level
      });
    }

    // 2. Ensure each SLO has a bloom object
    co.slos.forEach(slo => {
      const key = `${co.coCode}||${slo}`;
      if (!bloomMap.has(key)) {
        const level = getBloomLevelFromFirstVerb(slo);
        bloomMap.set(key, {
          type: "bloom",
          coCode: co.coCode,
          slo,
          level: level
        });
      }
    });
  });

  // Return all unique bloom objects from the Map
  return Array.from(bloomMap.values());
}

/* =====================================================
   POST-PROCESSING: ENSURE EVERY CO AND SLO HAS GAD DATA
===================================================== */
function ensureCompleteGadData(coAlignment, gadData) {
  const gadMap = new Map();

  // Use a Map to deduplicate based on (coCode, slo) or (coCode, CO_LEVEL)
  gadData.forEach(g => {
    const key = g.slo ? `${g.coCode}||${g.slo}` : `${g.coCode}||CO_LEVEL`;
    // Only set if not already present, effectively deduplicating
    if (!gadMap.has(key)) {
      gadMap.set(key, g);
    }
  });

  coAlignment.forEach(co => {
    // 1. Ensure CO itself has GAD data
    const coKey = `${co.coCode}||CO_LEVEL`;
    if (!gadMap.has(coKey)) {
      gadMap.set(coKey, {
        type: "gad",
        coCode: co.coCode,
        isGadRelated: false,
        explanation: ""
      });
    }

    // 2. Ensure each SLO has GAD data
    co.slos.forEach(slo => {
      const key = `${co.coCode}||${slo}`;
      if (!gadMap.has(key)) {
        gadMap.set(key, {
          type: "gad",
          coCode: co.coCode,
          slo,
          isGadRelated: false,
          explanation: ""
        });
      }
    });
  });

  // Return all unique GAD objects from the Map
  return Array.from(gadMap.values());
}

/* =====================================================
   POST /ai/scan  (NON STREAM)
===================================================== */
router.post("/scan", upload.single("file"), async (req, res) => {
  let filePath;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    filePath = req.file.path;
    const text = await extractTextFromFile(filePath, req.file.mimetype);
    const prompt = buildPrompt(text);

    const data = await executeAIRequest(async () => {
      const response = await fetch(`${getOpenAIBase()}/v1/chat/completions`, {
        method: "POST",
        headers: getHeaders(),
        agent: agent(getOpenAIBase()),
        body: JSON.stringify({
          model: getOpenAIModel(),
          messages: [{ role: "user", content: prompt }],
          stream: false,
          temperature: 0.1,
          top_p: 0.9,
          max_tokens: 8192
        })
      });

      if (!response.ok) {
        const retryAfterHeader = response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset-requests');
        const errorText = await response.text();
        const err = new Error(`AI request failed: ${response.status} ${errorText}`);
        err.status = response.status;
        err.retryAfter = retryAfterHeader;
        throw err;
      }
      return await response.json();
    }, { retries: 0 });

    const textResp = data?.choices?.[0]?.message?.content || "";

    const parsedObjects = extractAllJSON(textResp);

    const coAlignment = parsedObjects.filter(o => o.type === "co");
    const bloomObjects = parsedObjects.filter(o => o.type === "bloom");
    const gadObjects = parsedObjects.filter(o => o.type === "gad");
    const completeBloom = ensureCompleteBloomData(coAlignment, bloomObjects);
    const completeGad = ensureCompleteGadData(coAlignment, gadObjects);

    // --- Extractor Runs for Score & Suggestions calculation ---
    const fullText = await extractFullTextFromFile(filePath, req.file.mimetype);
    const headerText = await extractHeaderTextFromFile(filePath, req.file.mimetype);

    const titleVal = extractTitle(headerText);
    const courseCodeVal = extractCourseCode(headerText);
    const courseTitleVal = extractCourseTitle(fullText);
    const nominalDurationVal = extractNominalDuration(fullText);
    const prerequisiteVal = extractPrerequisite(fullText);
    const courseDescriptionVal = extractCourseDescription(fullText);
    const courseCreditVal = extractCourseCredit(fullText);
    const outcomesResultVal = extractCourseOutcomes(fullText);
    const referencesResultVal = extractReferences(fullText);
    const gradingResultVal = extractGradingSystem(fullText);
    const policiesResultVal = extractPolicies(fullText);
    const revisionResultVal = extractRevisionHistory(fullText);

    // Deduce missing sections
    const missingSections = [];
    if (!titleVal) missingSections.push('Title');
    if (!courseCodeVal) missingSections.push('Course Code');
    if (!courseTitleVal) missingSections.push('Course Title');
    if (!nominalDurationVal) missingSections.push('Nominal Duration');
    if (!prerequisiteVal) missingSections.push('Prerequisite');
    if (!courseDescriptionVal) missingSections.push('Course Description');
    if (!courseCreditVal) missingSections.push('Course Credit');
    if (!outcomesResultVal || !outcomesResultVal.outcomes || outcomesResultVal.outcomes.length === 0) missingSections.push('Course Outcomes');
    if (outcomesResultVal && Array.isArray(outcomesResultVal.missing) && outcomesResultVal.missing.length > 0) {
      missingSections.push(`Missing COs: ${outcomesResultVal.missing.map(n => `CO${n}`).join(', ')}`);
    }
    const hasGrading = gradingResultVal && (
      (gradingResultVal.majorOutput && gradingResultVal.majorOutput.trim()) ||
      (gradingResultVal.classStanding && gradingResultVal.classStanding.trim()) ||
      (gradingResultVal.midTermGrade && gradingResultVal.midTermGrade.trim()) ||
      (gradingResultVal.finalTermGrade && gradingResultVal.finalTermGrade.trim()) ||
      (gradingResultVal.finalGrade && gradingResultVal.finalGrade.trim())
    );
    if (!hasGrading) missingSections.push('Grading System');
    if (!(policiesResultVal && policiesResultVal.policies && policiesResultVal.policies.trim().length > 0)) missingSections.push('Policies');
    if (!(revisionResultVal && revisionResultVal.revisionHistory && revisionResultVal.revisionHistory.trim().length > 0)) missingSections.push('Revision History');

    // Deduce derived suggestions
    const derivedSuggestions = [];
    if (!titleVal) derivedSuggestions.push({ id: 'missing-title', title: 'Add Title', description: 'Provide a clear syllabus header title.', severity: 'high', category: 'Structure', recommendation: 'Include a header like "SYLLABUS" or the course name.' });
    if (!courseCodeVal) derivedSuggestions.push({ id: 'missing-code', title: 'Add Course Code', description: 'Include Course Code label and value.', severity: 'high', category: 'Structure', recommendation: 'Specify the code (e.g., CS 101).' });
    if (!courseTitleVal) derivedSuggestions.push({ id: 'missing-course-title', title: 'Add Course Title', description: 'Include Course Title label and value.', severity: 'high', category: 'Structure', recommendation: 'Specify the full course title.' });
    if (!nominalDurationVal) derivedSuggestions.push({ id: 'missing-duration', title: 'Add Nominal Duration', description: 'Specify the nominal duration.', severity: 'medium', category: 'Structure', recommendation: 'Include duration like "54 Hours" or "18 Weeks".' });
    if (!prerequisiteVal) derivedSuggestions.push({ id: 'missing-prereq', title: 'Add Prerequisite', description: 'Specify prerequisite if applicable or indicate none.', severity: 'medium', category: 'Structure', recommendation: 'State "None" if there are no prerequisites.' });
    if (!courseDescriptionVal) derivedSuggestions.push({ id: 'missing-desc', title: 'Add Course Description', description: 'Provide a concise course description.', severity: 'high', category: 'Structure', recommendation: 'Write a brief overview of the course goals.' });
    if (!courseCreditVal) derivedSuggestions.push({ id: 'missing-credit', title: 'Add Course Credit', description: 'Specify course credit units.', severity: 'medium', category: 'Structure', recommendation: 'Include units (e.g., "3 Units").' });
    if (!outcomesResultVal || !outcomesResultVal.outcomes || outcomesResultVal.outcomes.length === 0) {
      derivedSuggestions.push({ id: 'missing-cos', title: 'Add Course Outcomes', description: 'Include CO1–CO5 with measurable verbs.', severity: 'high', category: 'Course Outcomes', recommendation: 'Define 3-5 clear outcomes starting with action verbs.' });
    } else if (outcomesResultVal.missing && outcomesResultVal.missing.length > 0) {
      derivedSuggestions.push({
        id: 'incomplete-cos',
        title: 'Complete Missing COs',
        description: `Provide ${outcomesResultVal.missing.map(n => `CO${n}`).join(', ')}.`,
        severity: 'high',
        category: 'Course Outcomes',
        recommendation: 'Ensure each CO is clearly numbered and described.'
      });
    }
    if (!hasGrading) derivedSuggestions.push({ id: 'missing-grading', title: 'Add Grading System', description: 'Provide grading distribution and grade computation.', severity: 'high', category: 'Assessment', recommendation: 'Include a table or list showing percentage weights.' });
    if (!(policiesResultVal && policiesResultVal.policies && policiesResultVal.policies.trim().length > 0)) {
      derivedSuggestions.push({ id: 'missing-policies', title: 'Add Policies', description: 'Include institutional and course policies as bullet points.', severity: 'medium', category: 'Structure', recommendation: 'List rules for attendance, academic honesty, etc.' });
    }
    if (!(revisionResultVal && revisionResultVal.revisionHistory && revisionResultVal.revisionHistory.trim().length > 0)) {
      derivedSuggestions.push({ id: 'missing-revision', title: 'Add Revision History', description: 'Provide latest revision date and record.', severity: 'low', category: 'Structure', recommendation: 'Include a version number or last updated date.' });
    }

    // Bloom Taxonomy checks
    const bloomLevelMap = {
      Remembering: 1,
      Understanding: 2,
      Applying: 3,
      Analyzing: 4,
      Evaluating: 5,
      Creating: 6,
    };

    const bloomSuggestions = [];

    // 1. Minimum COs Check
    if (coAlignment.length < 3) {
      bloomSuggestions.push({
        id: `min-cos`,
        title: 'Insufficient Course Outcomes',
        description: `Only ${coAlignment.length} Course Outcome(s) detected. Minimum recommended is 3.`,
        severity: 'high',
        category: 'Course Outcomes',
        recommendation: 'Add additional Course Outcomes to fully cover the course learning objectives.'
      });
    }

    const bloomsByCo = new Map();
    completeBloom.forEach(item => {
      if (!bloomsByCo.has(item.coCode)) bloomsByCo.set(item.coCode, { slos: [] });
      const entry = bloomsByCo.get(item.coCode);
      if (item.slo) {
        entry.slos.push(item);
      } else {
        entry.coLevel = item.level;
      }
    });

    coAlignment.forEach(co => {
      const entry = bloomsByCo.get(co.coCode);
      const coLevel = entry?.coLevel;
      const slos = entry?.slos || [];

      // Missing SLOs Check
      if (slos.length === 0) {
        bloomSuggestions.push({
          id: `missing-slos-${co.coCode}`,
          title: `Missing SLOs (${co.coCode})`,
          description: `No specific learning outcomes (SLOs) were detected for ${co.coCode}. Each Course Outcome should have at least 3 aligned SLOs.`,
          severity: 'high',
          category: 'Course Outcomes',
          recommendation: `Add 3-5 specific, measurable learning outcomes that support the achievement of ${co.coCode}.`
        });
      }

      // Minimum SLOs Check
      if (slos.length > 0 && slos.length < 3) {
        bloomSuggestions.push({
          id: `min-slos-${co.coCode}`,
          title: `Insufficient SLOs (${co.coCode})`,
          description: `This CO has only ${slos.length} SLO(s). Minimum recommended is 3.`,
          severity: 'medium',
          category: 'Alignment',
          recommendation: 'Add more Specific Learning Outcomes to fully cover the Course Outcome.'
        });
      }

      // Maximum SLOs Check
      if (slos.length > 5) {
        bloomSuggestions.push({
          id: `max-slos-${co.coCode}`,
          title: `Too Many SLOs (${co.coCode})`,
          description: `This CO has ${slos.length} SLOs. Maximum recommended is 5.`,
          severity: 'medium',
          category: 'Alignment',
          recommendation: 'Review SLOs for redundancy and group similar ones.'
        });
      }

      // Missing CO Level Check
      if (!coLevel || coLevel === 'Unknown') {
        bloomSuggestions.push({
          id: `missing-co-level-${co.coCode}`,
          title: `Missing Bloom Level (${co.coCode})`,
          description: `${co.coCode} is missing a detectable Bloom's Taxonomy level. Please ensure the description starts with a detectable action verb.`,
          severity: 'medium',
          category: 'Bloom\'s Taxonomy',
          recommendation: `Start the description of ${co.coCode} with a strong action verb (e.g., "Analyze", "Evaluate", "Design").`
        });
      }

      // SLO level <= CO level check
      if (coLevel && bloomLevelMap[coLevel]) {
        const coLevelNum = bloomLevelMap[coLevel];
        const invalidSLOs = [];

        slos.forEach((sloBloom) => {
          if (sloBloom.level && bloomLevelMap[sloBloom.level]) {
            const sloLevelNum = bloomLevelMap[sloBloom.level];
            if (sloLevelNum > coLevelNum) {
              invalidSLOs.push({ slo: sloBloom.slo, level: sloBloom.level });
            }
          }
        });

        if (invalidSLOs.length > 0) {
          const validLevels = Object.keys(bloomLevelMap)
            .filter(level => bloomLevelMap[level] <= coLevelNum)
            .sort((a, b) => bloomLevelMap[a] - bloomLevelMap[b])
            .join(", ");

          const listText = invalidSLOs.length === 1
            ? `The SLO "${invalidSLOs[0].slo.length > 60 ? invalidSLOs[0].slo.substring(0, 60) + '...' : invalidSLOs[0].slo}"`
            : `${invalidSLOs.length} SLOs (including "${invalidSLOs[0].slo.substring(0, 30)}...")`;

          bloomSuggestions.push({
            id: `bloom-level-${co.coCode}`,
            title: `SLO Bloom Level Issue (${co.coCode})`,
            description: `${listText} exceed the cognitive level of ${co.coCode} (${coLevel}). SLOs should not be at a higher cognitive level than their parent CO.`,
            severity: 'high',
            category: 'Bloom\'s Taxonomy',
            recommendation: `Rephrase the affected SLOs using verbs from lower cognitive levels such as ${validLevels.split(',').slice(0, 2).join(', ')} to align with the CO level.`
          });
        }
      }

      // SLO Taxonomy Progression Check (within CO)
      const progressionIssues = [];
      let maxPrevLevelNum = 0;
      let maxPrevLevelName = '';
      for (let i = 0; i < slos.length; i++) {
        const currSLO = slos[i];

        if (currSLO.level && bloomLevelMap[currSLO.level]) {
          const currLevelNum = bloomLevelMap[currSLO.level];

          if (i > 0 && maxPrevLevelNum > 0 && currLevelNum < maxPrevLevelNum) {
            progressionIssues.push({
              curr: currSLO.slo,
              prev: maxPrevLevelName,
              currLevel: currSLO.level,
              prevLevel: maxPrevLevelName
            });
          }

          if (currLevelNum > maxPrevLevelNum) {
            maxPrevLevelNum = currLevelNum;
            maxPrevLevelName = currSLO.level;
          }
        }
      }

      if (progressionIssues.length > 0) {
        const listText = progressionIssues.length === 1
          ? `The SLO "${progressionIssues[0].curr.substring(0, 30)}..." (${progressionIssues[0].currLevel}) is at a lower level than preceding SLO (${progressionIssues[0].prevLevel})`
          : `${progressionIssues.length} SLOs follow a regressive Bloom sequence`;

        bloomSuggestions.push({
          id: `bloom-progression-${co.coCode}`,
          title: `SLO Progression Issue (${co.coCode})`,
          description: `${listText} within ${co.coCode}. SLOs should ideally progress from lower to higher cognitive levels or stay at the same level.`,
          severity: 'medium',
          category: 'Bloom\'s Taxonomy',
          recommendation: `Rephrase the affected SLOs to higher cognitive levels or reorder them to maintain logical progression from lower to higher Bloom levels.`
        });
      }
    });

    // Bloom's Taxonomy Progression Check across COs
    const coLevels = [];
    coAlignment.forEach(co => {
      const bloomObj = completeBloom.find(b => b.coCode === co.coCode && !b.slo);
      if (bloomObj && bloomObj.level && bloomLevelMap[bloomObj.level]) {
        coLevels.push({
          coCode: co.coCode,
          level: bloomLevelMap[bloomObj.level]
        });
      }
    });

    // Ensure COs are sorted numerically (CO1, CO2, etc.)
    coLevels.sort((a, b) => {
      const numA = parseInt(a.coCode.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.coCode.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    let maxPrevCOLevel = 0;
    let maxPrevCOLevelName = '';
    for (let i = 0; i < coLevels.length; i++) {
      const currCO = coLevels[i];
      if (i > 0 && maxPrevCOLevel > 0 && currCO.level < maxPrevCOLevel) {
        bloomSuggestions.push({
          id: `progression-${currCO.coCode}`,
          title: 'Taxonomy Progression Issue',
          description: `${currCO.coCode} is not aligned. It should be ${maxPrevCOLevelName} (Level ${maxPrevCOLevel}) or higher.`,
          severity: 'high',
          category: 'Bloom\'s Taxonomy',
          recommendation: 'Revise the Course Outcome action verbs to ensure a logical progression from lower-order to higher-order thinking skills.'
        });
      }
      if (currCO.level > maxPrevCOLevel) {
        maxPrevCOLevel = currCO.level;
        maxPrevCOLevelName = Object.keys(bloomLevelMap).find(key => bloomLevelMap[key] === currCO.level) || '';
      }
    }

    // Duplicate Bloom's Level Check
    const levelCounts = new Map();
    coLevels.forEach(co => {
      levelCounts.set(co.level, (levelCounts.get(co.level) || 0) + 1);
    });

    levelCounts.forEach((count, level) => {
      if (count >= 3) {
        const levelName = Object.keys(bloomLevelMap).find(key => bloomLevelMap[key] === level);
        bloomSuggestions.push({
          id: `overused-bloom-${level}`,
          title: 'Overused Bloom\'s Taxonomy Level',
          description: `Bloom level ${level} (${levelName}) is used in ${count} Course Outcomes. Only up to 2 are recommended. Consider revising to improve progression.`,
          severity: 'medium',
          category: 'Bloom\'s Taxonomy',
          recommendation: 'Revise the COs to ensure better progression and distribution.'
        });
      }
    });

    // Compute Overall compliance score
    let score = 0;
    if (titleVal) score += 8;
    if (courseCodeVal) score += 8;
    if (courseTitleVal) score += 8;
    if (nominalDurationVal) score += 6;
    if (prerequisiteVal) score += 6;
    if (courseDescriptionVal) score += 10;
    if (courseCreditVal) score += 6;
    const hasCOs = outcomesResultVal && outcomesResultVal.outcomes && outcomesResultVal.outcomes.length > 0;
    const validCOs = hasCOs && outcomesResultVal.isValid;
    if (validCOs) score += 10;
    const hasReferences = referencesResultVal && referencesResultVal.count > 0 && !referencesResultVal.missing;
    if (hasReferences) score += 6;
    if (hasGrading) score += 8;
    const hasPolicies = policiesResultVal && policiesResultVal.policies && policiesResultVal.policies.trim().length > 0;
    if (hasPolicies) score += 6;
    const hasRevision = revisionResultVal && revisionResultVal.revisionHistory && revisionResultVal.revisionHistory.trim().length > 0;
    if (hasRevision) score += 4;

    if (coAlignment.length > 0) {
      const coCount = coAlignment.length;
      let goodCos = 0;
      coAlignment.forEach(co => {
        const slos = completeBloom.filter(b => b.coCode === co.coCode && b.slo);
        if (slos.length >= 3) goodCos++;
      });
      const quality = coCount > 0 ? (goodCos / coCount) : 0;
      score += Math.round(14 * quality);
    }

    const allSuggestions = [...derivedSuggestions, ...bloomSuggestions];

    // Deduct score based on suggestions
    const highSeverityCount = allSuggestions.filter(s => s.severity === 'high').length;
    const mediumSeverityCount = allSuggestions.filter(s => s.severity === 'medium').length;
    const lowSeverityCount = allSuggestions.filter(s => s.severity === 'low').length;

    let deduction = highSeverityCount * 5 + mediumSeverityCount * 2 + lowSeverityCount * 1;
    deduction = Math.min(deduction, 40); // Cap deduction

    score = Math.max(0, score - deduction);
    if (score > 100) score = 100;

    let status = 'needs_improvement';
    if (score >= 85) status = 'excellent';
    else if (score >= 65) status = 'good';

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({
      result: {
        coAlignment,
        bloomData: completeBloom,
        gadData: completeGad,
        overallScore: score,
        status,
        suggestions: allSuggestions,
        missingSections
      }
    });

  } catch (err) {
    console.error("AI scan error:", err);

    // Stable error response with fallbacks
    const status = err.status || 500;
    const message = err.code === 'ECONNREFUSED'
      ? "AI service unavailable (Connection Refused)"
      : (err.message || "AI scan failed");

    res.status(status).json({
      error: message,
      fallback: true,
      result: { coAlignment: [], bloomData: [] }
    });
  } finally {
    safeUnlink(filePath);
  }
});

/* =====================================================
   POST /ai/scan-stream  (LIVE STREAM – raw tokens)
===================================================== */
router.post("/scan-stream", upload.single("file"), async (req, res) => {
  let filePath;
  let sseStarted = false;

  // Helper: safely write SSE and return whether it succeeded
  const sseWrite = (payload) => {
    try {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (e) {
      // Ignore write errors after connection is gone
    }
  };

  const sseEnd = () => {
    try {
      if (!res.writableEnded) res.end();
    } catch (e) { }
  };

  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    filePath = req.file.path;
    const text = await extractTextFromFile(filePath, req.file.mimetype);
    const prompt = buildPrompt(text);

    // Start SSE response before calling Gemini
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    sseStarted = true;

    // Track whether the client disconnected
    let clientGone = false;
    req.on("close", () => { clientGone = true; });

    // Make the AI request WITHOUT the retrying queue since headers are already sent.
    // A retry would try to re-call an already-started SSE stream, which is impossible.
    let aiResponse;
    try {
      aiResponse = await fetch(`${getOpenAIBase()}/v1/chat/completions`, {
        method: "POST",
        headers: getHeaders(),
        agent: agent(getOpenAIBase()),
        body: JSON.stringify({
          model: getOpenAIModel(),
          messages: [{ role: "user", content: prompt }],
          stream: true,
          temperature: 0.1,
          top_p: 0.9,
          max_tokens: 8192
        })
      });
    } catch (fetchErr) {
      // Network-level error (ECONNREFUSED, wsarecv, etc.) before we even got a response
      console.error("[scan-stream] Gemini fetch error:", fetchErr.message);
      const msg = fetchErr.code === 'ECONNREFUSED'
        ? "AI service unavailable (Connection Refused)"
        : "AI service connection failed. Please try again.";
      sseWrite({ type: "error", message: msg });
      sseEnd();
      return;
    }

    if (!aiResponse.ok) {
      let errorText = "";
      try { errorText = await aiResponse.text(); } catch { }
      console.error(`[scan-stream] Gemini returned ${aiResponse.status}:`, errorText.slice(0, 200));
      const msg = aiResponse.status === 429
        ? "AI quota exceeded. Please wait a moment and try again."
        : `AI request failed (${aiResponse.status}). Please try again.`;
      sseWrite({ type: "error", message: msg });
      sseEnd();
      return;
    }

    // Stream the response body to the client
    await new Promise((resolve) => {
      let buffer = "";

      aiResponse.body.on("data", (chunk) => {
        if (clientGone || res.writableEnded) return;
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              sseWrite({ type: "done" });
              continue;
            }
            try {
              const parsed = JSON.parse(payload);
              const token = parsed?.choices?.[0]?.delta?.content || "";
              if (token) sseWrite({ type: "token", token });
            } catch (e) { }
          }
        }
      });

      aiResponse.body.on("end", () => {
        sseWrite({ type: "done" });
        resolve();
      });

      // Handle mid-stream TCP errors (e.g., Windows wsarecv connection reset)
      aiResponse.body.on("error", (streamErr) => {
        console.error("[scan-stream] Mid-stream error from Gemini:", streamErr.message);
        // Send partial-result notice so frontend can show what it got
        sseWrite({ type: "error", message: "Stream interrupted by server. Partial results may be available." });
        resolve(); // Resolve (not reject) so we end cleanly without crashing
      });
    });

    sseEnd();

  } catch (err) {
    console.error("[scan-stream] Unexpected error:", err);
    if (!sseStarted) {
      // SSE not started yet, can still send a normal HTTP error
      if (!res.headersSent) {
        res.status(err.status || 500).json({ error: err.message || "Stream failure" });
      }
    } else {
      // SSE already started, send error event and end cleanly
      sseWrite({ type: "error", message: err.message || "Stream failure" });
      sseEnd();
    }
  } finally {
    safeUnlink(filePath);
  }
});

/* =====================================================
   POST /ai/analyze-table  (Python service for empty cell analysis)
===================================================== */
const FormData = require('form-data');
const { createReadStream } = require('fs');

const getPythonServiceUrl = () => (process.env.PYTHON_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, "");

router.post("/analyze-table", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    // Forward file to Python service

    const data = await executeAIRequest(async () => {
      const formData = new FormData();
      formData.append("file", createReadStream(filePath), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const response = await fetch(`${getPythonServiceUrl()}/analyze-table`, {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`Python service error: ${response.status} ${errorText}`);
        err.status = response.status;
        throw err;
      }
      return await response.json();
    });

    // Python service returned data
    const sanitizeTableAnalysis = (tableData) => {
      if (!tableData || typeof tableData !== "object") return tableData;
      const cleanSection = (sec) => {
        if (!sec || typeof sec !== "object") return {};
        const cleanSec = {};
        const keys = Object.keys(sec);
        const hasWeek = keys.some(k => /^week$/i.test(k.trim()));
        for (const [k, v] of Object.entries(sec)) {
          if (hasWeek && /^week[_\s-]?\d+$/i.test(k.trim())) {
            continue;
          }
          cleanSec[k] = v;
        }
        return cleanSec;
      };
      return {
        ...tableData,
        pre_midterm: cleanSection(tableData.pre_midterm),
        pre_final: cleanSection(tableData.pre_final),
      };
    };

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(sanitizeTableAnalysis(data));
  } catch (err) {
    console.error("Table analysis error:", err);
    const status = err.status || 500;
    res.status(status).json({
      error: "Table analysis failed",
      details: err.message,
      fallback: true,
      pre_midterm: {},
      pre_final: {}
    });
  } finally {
    safeUnlink(filePath);
  }
});


router.post("/extract-fields", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;

    const data = await executeAIRequest(async () => {
      const formData = new FormData();
      formData.append("file", createReadStream(filePath), {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const response = await fetch(`${getPythonServiceUrl()}/extract-fields`, {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(`Python service error: ${response.status} ${errorText}`);
        err.status = response.status;
        throw err;
      }
      return await response.json();
    });

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(data);
  } catch (err) {
    console.error("Field extraction error:", err);
    const status = err.status || 500;
    res.status(status).json({ error: "Field extraction failed", details: err.message });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-course-code", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractHeaderTextFromFile(filePath, req.file.mimetype);
    const code = extractCourseCode(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ courseCode: code || null, status: code ? "passes" : "missing" });
  } catch (err) {
    console.error("Course code extraction error:", err);
    res.status(500).json({ error: "Course code extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-college", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractHeaderTextFromFile(filePath, req.file.mimetype);
    const college = extractCollege(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ college: college || null, status: college ? "passes" : "missing" });
  } catch (err) {
    console.error("College extraction error:", err);
    res.status(500).json({ error: "College extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-department", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractHeaderTextFromFile(filePath, req.file.mimetype);
    const department = extractDepartment(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ department: department || null, status: department ? "passes" : "missing" });
  } catch (err) {
    console.error("Department extraction error:", err);
    res.status(500).json({ error: "Department extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

router.post("/extract-semester", upload.single("file"), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }
    filePath = req.file.path;
    const text = await extractHeaderTextFromFile(filePath, req.file.mimetype);
    const semester = extractSemester(text);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json({ semester: semester || null, status: semester ? "passes" : "missing" });
  } catch (err) {
    console.error("Semester extraction error:", err);
    res.status(500).json({ error: "Semester extraction failed" });
  } finally {
    safeUnlink(filePath);
  }
});

module.exports = router;
