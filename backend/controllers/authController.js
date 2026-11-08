const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { createForAdmins, createForUser } = require("./notificationsController");
const crypto = require("crypto");
const { generateEmployeeId } = require("../utils/idGenerator");

async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Missing credentials" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }
    if (user.is_active === false) {
      return res.status(403).json({ success: false, error: "Account inactive" });
    }
    if (user.status === "ARCHIVED") {
      return res.status(403).json({ success: false, error: "Account archived" });
    }
    if (user.is_locked === true) {
      return res.status(401).json({ success: false, error: "Your account is locked. Please contact the administrator for clarifications." });
    }
    
    // Check if the user is a Google-only account
    if (!user.password_hash) {
      return res.status(401).json({ 
        success: false, 
        error: "This account is linked with Google. Please use 'Continue with Google' to sign in." 
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }
    const approvedRoles = ["FACULTY", "DEPT_HEAD", "DEAN", "CITL", "VPAA", "ADMIN"];
    const role = user.role && approvedRoles.includes(user.role) ? user.role : "FACULTY";
    user.last_login = new Date();
    user.updated_at = new Date();
    user.is_active = true;
    await user.save();
    const payload = { sub: String(user._id), email: user.email, role };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "dev_secret", { expiresIn: "7d" });
    const clientRoleMap = {
      FACULTY: "faculty",
      DEPT_HEAD: "dept_head",
      DEAN: "dean",
      CITL: "citl",
      VPAA: "vpaa",
      ADMIN: "admin",
    };
    const clientUser = {
      id: String(user._id),
      employeeId: user.employee_id || "",
      email: user.email,
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      role: clientRoleMap[role] || "faculty",
      isApproved: true,
      college: user.college || "",
      department: user.department || "",
      notificationsEnabled: user.notifications_enabled !== false,
      theme: user.theme_preference === "dark" ? "dark" : "light",
      hasPassword: !!user.password_hash,
    };
    return res.json({ success: true, token, user: clientUser });
  } catch {
    return res.status(500).json({ success: false, error: "Login failed" });
  }
}

async function register(req, res) {
  try {
    const { firstName, lastName, email, password, role, college, department, isApproved, isSeniorFaculty } = req.body || {};
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const nameRegex = /\d/;
    if (nameRegex.test(firstName) || nameRegex.test(lastName)) {
      return res.status(400).json({ success: false, error: "First and last names cannot contain numbers" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, error: "Email already registered" });
    }
    const roleMap = {
      faculty: "FACULTY",
      dept_head: "DEPT_HEAD",
      dean: "DEAN",
      citl: "CITL",
      vpaa: "VPAA",
      admin: "ADMIN",
    };
    const dbRole = roleMap[role] || "FACULTY";
    
    let password_hash = null;
    
    // Updated validation based on role
    if (["FACULTY", "DEPT_HEAD"].includes(dbRole)) {
      if (!college || !department) {
        return res.status(400).json({ success: false, error: "College and department are required for this role" });
      }
    } else if (dbRole === "DEAN") {
      if (!college) {
        return res.status(400).json({ success: false, error: "College is required for Dean role" });
      }
    }
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
      }
      const salt = await bcrypt.genSalt(10);
      password_hash = await bcrypt.hash(String(password), salt);
    }

    let is_active = false;
    
    // Check if the request includes a valid admin token and the user should be approved
    if (isApproved === true) {
      try {
        const auth = String(req.headers.authorization || "").trim();
        if (auth.toLowerCase().startsWith("bearer ")) {
          const token = auth.slice(7).trim();
          const secret = process.env.JWT_SECRET || "dev_secret";
          const decoded = jwt.verify(token, secret);
          const reqUserId = String(decoded.sub || "");
          const requester = reqUserId ? await User.findById(reqUserId) : null;
          if (requester && (requester.role === 'ADMIN' || requester.role === 'admin')) {
            is_active = true;
          }
        }
      } catch (err) {
        console.error("Token verification failed during registration:", err);
      }
    }

    // Generate role-based employee ID automatically
    const seniorFacultyFlag = dbRole === "FACULTY" && isSeniorFaculty === true;
    const employeeId = await generateEmployeeId(dbRole, seniorFacultyFlag);

    const user = new User({
      employee_id: employeeId,
      is_senior_faculty: seniorFacultyFlag,
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      password_hash,
      role: dbRole,
      college: college || "",
      department: department || "",
      status: "ACTIVE",
      is_active,
      updated_at: new Date(),
      notifications_enabled: true,
      theme_preference: "light",
    });
    await user.save();

    if (!is_active) {
      await createForAdmins(
        "New User Registration",
        `New user "${firstName} ${lastName}" (${normalizedEmail}) pending approval`,
        null,
        `A new user has registered:\n\nName: ${firstName} ${lastName}\nEmail: ${normalizedEmail}\n\nPlease review and approve the account in the Admin panel.`
      );
    }
    const clientUser = {
      id: String(user._id),
      employeeId: user.employee_id || "",
      email: user.email,
      firstName,
      lastName,
      role,
      isApproved: true,
      college: user.college,
      department: user.department,
    };
    if (global.io) {
      global.io.emit("update_users");
    }
    
    return res.status(201).json({ success: true, user: clientUser });
  } catch {
    return res.status(500).json({ success: false, error: "Registration failed" });
  }
}

module.exports = { login, register };
 
async function forgotPassword(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) {
      console.log("ForgotPassword Error: Email is missing in request body");
      return res.status(400).json({ success: false, error: "Email is required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    console.log(`ForgotPassword Attempt: Searching for user with email: "${normalizedEmail}"`);
    
    // Debug: List some users to see how emails are stored
    const sampleUsers = await User.find({}, { email: 1 }).limit(5);
    console.log("Debug: Sample emails in DB:", sampleUsers.map(u => `"${u.email}"`));

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.log(`ForgotPassword Error: User not found with email: ${normalizedEmail}`);
      // Return success anyway for security reasons, but log it internally
      return res.json({ success: true }); 
    }
    
    if (!user.password_hash) {
      console.log(`ForgotPassword Error: Cannot reset password for Google Auth user: ${normalizedEmail}`);
      return res.status(400).json({ 
        success: false, 
        error: "This account uses Google Sign-In and cannot have its password reset. Please use 'Continue with Google' to log in." 
      });
    }
    
    console.log(`ForgotPassword: User found. Generating token for ${user.email}`);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    user.password_reset_token = token;
    user.password_reset_expires = expires;
    await user.save();
    
    const clientUrl = process.env.CLIENT_URL || "http://localhost:8080";
    const resetLink = `${clientUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;
    
    console.log(`ForgotPassword: Attempting to send email to ${user.email}`);
    if (user.email) {
      const sent = await sendEmail(
        user.email,
        "Sulundan: Password Reset Instructions",
        `You requested a password reset for your Sulundan account.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link will expire in 1 hour. If you didn't request this, you can safely ignore this email.`
      );
      
      if (sent) {
        console.log(`ForgotPassword: Email successfully sent to ${user.email}`);
      } else {
        console.error(`ForgotPassword Error: Failed to send email to ${user.email}`);
        return res.status(500).json({ 
          success: false, 
          error: "System was unable to send the reset email. Please contact the administrator to check the email server configuration." 
        });
      }
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("ForgotPassword System Error:", error);
    return res.status(500).json({ success: false, error: "Failed to send reset email" });
  }
}
 
async function resetPassword(req, res) {
  try {
    const { token, email, password } = req.body || {};
    if (!token || !email || !password) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail, password_reset_token: token });
    if (!user) {
      return res.status(400).json({ success: false, error: "Invalid or expired token" });
    }
    if (!user.password_reset_expires || user.password_reset_expires.getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: "Token expired" });
    }
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(String(password), salt);
    user.password_reset_token = null;
    user.password_reset_expires = null;
    user.updated_at = new Date();
    await user.save();
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to reset password" });
  }
}
 
module.exports.forgotPassword = forgotPassword;
module.exports.resetPassword = resetPassword;
