const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { createForAdmins, sendEmail } = require("./notificationsController");
const { generateEmployeeId } = require("../utils/idGenerator");
 
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback";
const googleClient = googleClientId ? new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri) : null;
 
function mapRoleToClient(dbRole) {
  const clientRoleMap = {
    FACULTY: "faculty",
    DEPT_HEAD: "dept_head",
    DEAN: "dean",
    CITL: "citl",
    VPAA: "vpaa",
    ADMIN: "admin",
  };
  return clientRoleMap[dbRole] || "faculty";
}
 
async function loginWithGoogleToken(req, res) {
  try {
    const { idToken } = req.body || {};
    if (!googleClient) {
      return res.status(500).json({ success: false, error: "GOOGLE_CLIENT_ID not configured" });
    }
    if (!idToken) {
      return res.status(400).json({ success: false, error: "Missing idToken" });
    }
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    const email = String(payload.email || "").trim().toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      if (existing.is_active === false) {
        return res.status(403).json({ success: false, error: "Account inactive" });
      }
      if (existing.status === "ARCHIVED") {
        return res.status(403).json({ success: false, error: "Account archived" });
      }
      if (existing.is_locked === true) {
        return res.status(401).json({ success: false, error: "Your account is locked. Please contact the administrator for clarifications." });
      }
      existing.last_login = new Date();
      existing.updated_at = new Date();
      existing.is_active = true;
      await existing.save();

      const role = mapRoleToClient(existing.role);
      const jwtPayload = { sub: String(existing._id), email: existing.email, role: existing.role };
      const jwtToken = require("jsonwebtoken").sign(jwtPayload, process.env.JWT_SECRET || "dev_secret", { expiresIn: "7d" });

      const user = {
        id: String(existing._id),
        employeeId: existing.employee_id || "",
        email: existing.email,
        firstName: existing.first_name || "",
        lastName: existing.last_name || "",
        role,
        isApproved: true,
        college: existing.college || "",
        department: existing.department || "",
        notificationsEnabled: existing.notifications_enabled !== false,
        theme: existing.theme_preference === "dark" ? "dark" : "light",
      };
      return res.json({ success: true, user, token: jwtToken });
    }
    const employeeId = await generateEmployeeId("FACULTY", false);
    const user = new User({
      employee_id: employeeId,
      first_name: payload.given_name || "",
      last_name: payload.family_name || "",
      email,
      role: "FACULTY",
      college: "",
      department: "",
      status: "ACTIVE",
      is_active: false,
      last_login: new Date(),
      updated_at: new Date(),
    });
    await user.save();
    await createForAdmins(
      "New User Registration (Google)",
      `New user "${user.first_name} ${user.last_name}" (${email}) pending approval`
    );
    const admins = await User.find({ role: "ADMIN" }, { email: 1, notifications_enabled: 1 });
    const adminEmails = admins
      .filter(a => a.notifications_enabled !== false && !!a.email)
      .map(a => a.email);
    await Promise.all(
      adminEmails.map(adminEmail =>
        sendEmail(
          adminEmail,
          "New User Registration Pending Approval",
          `A new user registered with Google:\n\nName: ${user.first_name} ${user.last_name}\nEmail: ${email}\n\nPlease review and approve the account in the Admin panel.`
        )
      )
    );
    
    const jwtPayload = { sub: String(user._id), email: user.email, role: user.role };
    const jwtToken = require("jsonwebtoken").sign(jwtPayload, process.env.JWT_SECRET || "dev_secret", { expiresIn: "7d" });

    return res.json({
      success: true,
      token: jwtToken,
      user: {
        id: String(user._id),
        employeeId: user.employee_id || "",
        email: user.email,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        role: "faculty",
        isApproved: true,
        college: "",
        department: "",
        notificationsEnabled: true,
        theme: "light",
      },
    });
  } catch {
    return res.status(401).json({ success: false, error: "Invalid Google token" });
  }
}
 
function googleAuthorize(req, res) {
  if (!googleClient) {
    return res.status(500).send("Google OAuth not configured");
  }
  const url = googleClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["openid", "email", "profile"],
  });
  return res.redirect(url);
}
 
async function googleCallback(req, res) {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:8080";
  try {
    if (!googleClient) {
      return res.redirect(`${clientUrl}/login?google=error&message=OAuth+not+configured`);
    }

    // Handle user cancellation or other errors from Google
    if (req.query.error === "access_denied") {
      return res.redirect(`${clientUrl}/login?google=cancel`);
    }

    const code = req.query.code;
    if (!code) {
      return res.redirect(`${clientUrl}/login?google=error&message=Missing+authorization+code`);
    }
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    const clientUrl = process.env.CLIENT_URL || "http://localhost:8080";
    const email = String(payload.email || "").trim().toLowerCase();
    let user = await User.findOne({ email });
    if (!user) {
      // NEW USER: Redirect to signup form with Google info
      const firstName = payload.given_name || "";
      const lastName = payload.family_name || "";
      const params = new URLSearchParams({
        google: "true",
        email: email,
        firstName: firstName,
        lastName: lastName,
      });
      return res.redirect(`${clientUrl}/signup?${params.toString()}`);
    }

    // EXISTING USER: Check if approved
    if (user.is_active === false) {
      return res.redirect(`${clientUrl}/login?google=pending`);
    }
    
    if (user.status === "ARCHIVED") {
      return res.redirect(`${clientUrl}/login?google=error&message=Account+archived`);
    }
    
    if (user.is_locked === true) {
      return res.redirect(`${clientUrl}/login?google=error&message=Account+locked`);
    }

    // APPROVED USER: Proceed to login
    user.last_login = new Date();
    user.updated_at = new Date();
    await user.save();

    const role = mapRoleToClient(user.role);
    const jwtPayload = { sub: String(user._id), email: user.email, role: user.role };
    const jwtToken = require("jsonwebtoken").sign(jwtPayload, process.env.JWT_SECRET || "dev_secret", { expiresIn: "7d" });

    const params = new URLSearchParams({
      google: "success",
      id: String(user._id),
      employeeId: user.employee_id || "",
      email: user.email || "",
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      picture: payload.picture || "",
      role,
      token: jwtToken,
      notificationsEnabled: user.notifications_enabled !== false ? "true" : "false",
      theme: user.theme_preference === "dark" ? "dark" : "light",
      hasPassword: !!user.password_hash ? "true" : "false",
    });
    return res.redirect(`${clientUrl}/login?${params.toString()}`);
  } catch {
    const clientUrl = process.env.CLIENT_URL || "http://localhost:8080";
    return res.redirect(`${clientUrl}/login?google=error`);
  }
}
 
module.exports = { loginWithGoogleToken, googleAuthorize, googleCallback };
