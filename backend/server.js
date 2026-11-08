const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { createServer } = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const cron = require("node-cron");
require("dotenv").config();

const { runBackup, cleanupOldBackups } = require("./utils/backup");

// --- Backup Automation (Every day at 2 AM) ---
cron.schedule("0 2 * * *", async () => {
  console.log("[CRON] Starting daily backup...");
  try {
    await runBackup();
    await cleanupOldBackups(7); // Keep last 7 days
    console.log("[CRON] Daily backup successful.");
  } catch (err) {
    console.error("[CRON] Daily backup failed:", err);
  }
});

const app = express();

// --- Security Middleware ---
app.use(helmet()); // Set security HTTP headers
app.use(mongoSanitize()); // Data sanitization against NoSQL query injection
app.use(xss()); // Data sanitization against XSS
app.use(hpp()); // Prevent HTTP parameter pollution

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes"
});
// Apply rate limiting to all requests (can be more specific later)
app.use("/auth", limiter); // Especially for auth routes

const fetch = global.fetch || require("node-fetch");
const corsOrigin = process.env.CLIENT_URL || "http://localhost:8080";
const allowedOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://10.0.0.39:8080",
  "http://10.0.0.38:8080"
];

// Initialize HTTP Server and Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // Increase timeouts so the WS connection survives long-running AI scans
  pingTimeout: 120000,  // 2 minutes – wait this long for a pong before disconnecting
  pingInterval: 25000,  // ping every 25s to keep the connection alive
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || 
                        origin.includes("10.0.0.39") || 
                        origin.includes("10.0.0.38") ||
                        origin.includes("localhost") ||
                        origin.includes("127.0.0.1");
      if (isAllowed) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true,
  }
});
app.set("io", io);
global.io = io;

io.on("connection", (socket) => {
  console.log("WebSocket client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("WebSocket client disconnected:", socket.id);
  });
});

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(o => origin.startsWith(o)) || 
                      origin.includes("10.0.0.39") || 
                      origin.includes("10.0.0.38") ||
                      origin.includes("localhost") ||
                      origin.includes("127.0.0.1");
                      
    if (isAllowed) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ["Content-Disposition", "Content-Type"]
}));
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve signatures
const sigDir = path.resolve(__dirname, "signatures");
try {
  fs.mkdirSync(sigDir, { recursive: true });
} catch {}
app.use("/signatures", express.static(sigDir, { maxAge: "1h" }));

// Serve templates for public download
const tmplDir = path.resolve(__dirname, "templates");
try {
  fs.mkdirSync(tmplDir, { recursive: true });
  ["syllabus", "form17", "form18"].forEach(t => {
    fs.mkdirSync(path.join(tmplDir, t), { recursive: true });
  });
} catch {}

// Served with custom headers and static middleware
const staticOpts = { 
  maxAge: "1h",
  setHeaders: (res, path) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (path.endsWith(".docx") || path.endsWith(".doc")) {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }
  }
};

app.use("/templates", express.static(path.join(tmplDir, "syllabus"), staticOpts));
app.use("/templates", express.static(path.join(tmplDir, "form17"), staticOpts));
app.use("/templates", express.static(path.join(tmplDir, "form18"), staticOpts));
app.use("/templates", express.static(tmplDir, staticOpts));

// Backward-compat fallback route - searches all subfolders
app.get("/templates/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename) return res.status(404).end();
    
    const types = ["syllabus", "form17", "form18"];
    let targetPath = path.join(tmplDir, filename);
    
    if (!fs.existsSync(targetPath)) {
      for (const t of types) {
        const p = path.join(tmplDir, t, filename);
        if (fs.existsSync(p)) {
          targetPath = p;
          break;
        }
      }
    }

    if (fs.existsSync(targetPath)) {
      if (targetPath.endsWith(".docx") || targetPath.endsWith(".doc")) {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.sendFile(targetPath);
    }
    
    return res.status(404).end();
  } catch {
    return res.status(404).end();
  }
});

// Serve uploaded syllabi
const uplDir = path.resolve(__dirname, "uploads", "syllabi");
try {
  fs.mkdirSync(uplDir, { recursive: true });
} catch {}
app.use("/uploads/syllabi", express.static(uplDir, { maxAge: "1h" }));

// Serve custom forms
const formsDir = path.resolve(__dirname, "uploads", "forms");
try {
  fs.mkdirSync(formsDir, { recursive: true });
} catch {}
app.use("/uploads/forms", express.static(formsDir, { maxAge: "1h" }));

// Serve sample files from frontend/public
const sampleFilesDir = path.resolve(__dirname, "..", "frontend", "public", "sample-files");
app.use("/sample-files", express.static(sampleFilesDir, { maxAge: "1h" }));

// Endpoint to save a base64 signature image and return a public URL
app.post("/signatures", (req, res) => {
  try {
    const { imageData } = req.body || {};
    if (!imageData || typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
      return res.status(400).json({ success: false, error: "Invalid imageData" });
    }
    const m = imageData.match(/^data:image\/(png|jpeg);base64,(.+)$/i);
    if (!m) {
      return res.status(400).json({ success: false, error: "Unsupported image format" });
    }
    const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : "png";
    const buf = Buffer.from(m[2], "base64");
    const name = `sig_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = path.join(sigDir, name);
    fs.writeFileSync(filePath, buf);
    // The URL must be accessible from the ONLYOFFICE Document Server (Docker container).
    // Therefore, we use the INTERNAL_BASE_URL which should be set to http://host.docker.internal:5000
    const base = (process.env.INTERNAL_BASE_URL || `http://localhost:5000`).replace(/\/+$/, "");
    const url = `${base}/signatures/${name}`;
    return res.json({ success: true, url });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to save signature" });
  }
});

const authRoutes = require("./routes/auth");
app.use("/auth", authRoutes);
const adminRoutes = require("./routes/admin");
app.use("/admin", adminRoutes);
const usersRoutes = require("./routes/users");
app.use("/users", usersRoutes);
const notificationsRoutes = require("./routes/notifications");
app.use("/notifications", notificationsRoutes);
const requestsRoutes = require("./routes/requests");
app.use("/requests", requestsRoutes);
const docsRoutes = require("./routes/docs");
app.use("/docs", docsRoutes);
const templatesRoutes = require("./routes/templates");
app.use("/templates-api", templatesRoutes);
const syllabiRoutes = require("./routes/syllabi");
app.use("/syllabi", syllabiRoutes);
const aiRoutes = require("./routes/ai");
app.use("/ai", aiRoutes);
const semestersRoutes = require("./routes/semesters");
app.use("/semesters", semestersRoutes);

app.get("/ai/health", async (req, res) => {
  try {
    const base = process.env.LLM_BASE || "http://llama:8080";
    const root = base.replace(/\/+$/, "");
    let ok = false;
    try {
      const r1 = await fetch(`${root}/v1/models`);
      ok = r1 && r1.ok;
    } catch {}
    if (!ok) {
      const r2 = await fetch(`${root}/health`).catch(() => null);
      ok = !!(r2 && r2.ok);
    }
    if (!ok) throw new Error("LLM not responding");
    res.json({ status: "online", service: "llama" });
  } catch {
    res.status(500).json({ status: "offline", service: "llama" });
  }
});

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not defined");
}

const User = require("./models/User");
async function ensureUserFields() {
  try {
    const now = new Date();
    await User.updateMany({ is_active: { $exists: false } }, { $set: { is_active: true } });
    await User.updateMany({ updated_at: { $exists: false } }, { $set: { updated_at: now } });
    await User.updateMany({ last_login: { $exists: false } }, { $set: { last_login: null } });
    await User.updateMany({ status: { $exists: false } }, { $set: { status: "ACTIVE" } });
    console.log("User fields ensured");
  } catch (e) {
    console.warn("ensureUserFields failed:", e?.message || e);
  }
}

mongoose
  .connect(uri, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log("MongoDB connected");
    ensureUserFields();
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const port = process.env.PORT || 5000;
httpServer.listen(port, () => {
  console.log(`Server & WebSocket listening on port ${port}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully.");
  process.exit(0);
});
