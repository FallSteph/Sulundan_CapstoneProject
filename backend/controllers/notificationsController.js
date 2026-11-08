const Notification = require("../models/Notification");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function getTransporter() {
  // Use current env values in case they were updated
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      // Gmail App Passwords can be provided with or without spaces
      pass: (process.env.EMAIL_PASS || "").trim(),
    },
  });
}

async function listByUser(req, res) {
  try {
    const userId = req.params.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }
    const notifs = await Notification.find({ user_id: userId }).sort({ created_at: -1 });
    return res.json({
      success: true,
      notifications: notifs.map(n => ({
        id: String(n._id),
        userId: String(n.user_id),
        title: n.title,
        message: n.message,
        syllabusId: n.syllabus_id ? String(n.syllabus_id) : undefined,
        link: n.link,
        isRead: !!n.is_read,
        createdAt: n.created_at.toISOString(),
      })),
    });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to load notifications" });
  }
}

async function markRead(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: "Missing id" });
    }
    const n = await Notification.findByIdAndUpdate(id, { $set: { is_read: true } }, { new: true });
    if (!n) {
      return res.status(404).json({ success: false, error: "Notification not found" });
    }
    
    if (global.io) {
      global.io.emit("update_notifications");
    }
    
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to mark read" });
  }
}

async function createForAdmins(title, message, syllabusId, emailMessage, link) {
  try {
    const admins = await User.find({ role: "ADMIN" });
    const docs = admins.map(a => ({ user_id: a._id, title, message, syllabus_id: syllabusId, link }));
    if (docs.length > 0) {
      await Notification.insertMany(docs);
      
      // Send email to admins who have notifications enabled
      for (const admin of admins) {
        if (admin.email && admin.notifications_enabled !== false) {
          await sendEmail(admin.email, title, emailMessage || message);
        }
      }
      
      if (global.io) {
        global.io.emit("update_notifications");
      }
    }
  } catch (error) {
    console.error("Error in createForAdmins:", error);
  }
}

async function createForUser(userId, title, message, syllabusId, emailMessage, link) {
  try {
    await Notification.create({ user_id: userId, title, message, syllabus_id: syllabusId, link });
    
    // Send email if user has notifications enabled
    const user = await User.findById(userId);
    if (user && user.email && user.notifications_enabled !== false) {
      await sendEmail(user.email, title, emailMessage || message);
    }
    
    if (global.io) {
      global.io.emit("update_notifications");
    }
  } catch (error) {
    console.error("Error in createForUser:", error);
  }
}

async function sendEmail(to, subject, text) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("Email configuration missing in .env");
      return false;
    }
    
    // Use fresh transporter with latest credentials
    const currentTransporter = getTransporter();
    
    const systemFooter = "\n\n--\nThis is an automated notification from the Sulundan System. Please do not reply to this email.";
    const finalMessage = text.includes("automated notification") ? text : text + systemFooter;
    
    const info = await currentTransporter.sendMail({
      from: `"Sulundan" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text: finalMessage,
    });
    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Nodemailer Error Details:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    return false;
  }
}

async function createNotification(req, res) {
  try {
    const { userId, title, message, syllabusId, link } = req.body || {};
    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }
    const u = await User.findById(userId).lean();
    if (!u) return res.status(404).json({ success: false, error: "User not found" });
    const n = await Notification.create({ user_id: userId, title, message, syllabus_id: syllabusId, link });
    
    if (global.io) {
      global.io.emit("update_notifications");
    }
    
    return res.status(201).json({ success: true, notification: { id: String(n._id) } });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to create notification" });
  }
}

module.exports = { listByUser, markRead, createForAdmins, createForUser, sendEmail, createNotification };
