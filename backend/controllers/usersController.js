const User = require("../models/User");
const { createForUser, sendEmail } = require("./notificationsController");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { generateEmployeeId } = require("../utils/idGenerator");

function getUserIdFromToken(req) {
    try {
        const auth = String(req.headers.authorization || "").trim();
        if (auth.toLowerCase().startsWith("bearer ")) {
            const token = auth.slice(7).trim();
            const secret = process.env.JWT_SECRET || "dev_secret";
            const decoded = jwt.verify(token, secret);
            return String(decoded.sub || "");
        }
    } catch (err) { }
    return null;
}

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

function mapRoleToDb(clientRole) {
    const roleMap = {
        faculty: "FACULTY",
        dept_head: "DEPT_HEAD",
        dean: "DEAN",
        citl: "CITL",
        vpaa: "VPAA",
        admin: "ADMIN",
    };
    return roleMap[clientRole] || "FACULTY";
}

function toClientUser(u) {
    return {
        id: String(u._id),
        employeeId: u.employee_id || "",
        isSeniorFaculty: !!u.is_senior_faculty,
        email: u.email || "",
        firstName: u.first_name || "",
        lastName: u.last_name || "",
        role: mapRoleToClient(u.role),
        isApproved: true,
        college: u.college || "",
        department: u.department || "",
        status: (u.status === "ARCHIVED" ? "archived" : "active"),
        isActive: !!u.is_active,
        isLocked: !!u.is_locked,
        lastLogin: u.last_login ? new Date(u.last_login).toISOString() : "",
        updatedAt: u.updated_at ? new Date(u.updated_at).toISOString() : "",
        createdAt: new Date(u._id.getTimestamp()).toISOString().split("T")[0],
        notificationsEnabled: !!u.notifications_enabled,
        theme: u.theme_preference === "dark" ? "dark" : "light",
        hasPassword: !!u.password_hash,
    };
}

async function listUsers(req, res) {
    try {
        const users = await User.find({}).sort({ last_name: 1, first_name: 1 });
        return res.json({ success: true, users: users.map(toClientUser) });
    } catch (err) {
        return res.status(500).json({ success: false, error: "Failed to load users" });
    }
}

async function getUser(req, res) {
    try {
        const { id } = req.params;
        const u = await User.findById(id);
        if (!u) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        return res.json({ success: true, user: toClientUser(u) });
    } catch {
        return res.status(500).json({ success: false, error: "Failed to load user" });
    }
}

async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { firstName, lastName, email, role, college, department, status, isActive, isLocked, notificationsEnabled, theme, selfUpdate, rejectRegistration, currentPassword, newPassword } = req.body || {};
        const prev = await User.findById(id);
        if (!prev) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        const update = {};

        // Get requester info to check if admin
        const requesterId = getUserIdFromToken(req);
        const requester = requesterId ? await User.findById(requesterId) : null;
        const isAdmin = requester && (requester.role === 'ADMIN' || requester.role === 'admin');

        // Password Update Logic
        if (newPassword) {
            if (!isAdmin && !currentPassword && prev.password_hash) {
                return res.status(400).json({ success: false, error: "Current password is required" });
            }

            if (!isAdmin && prev.password_hash) {
                const isMatch = await bcrypt.compare(currentPassword, prev.password_hash);
                if (!isMatch) {
                    return res.status(401).json({ success: false, error: "Incorrect current password" });
                }
            }

            if (newPassword.length < 8) {
                return res.status(400).json({ success: false, error: "New password must be at least 8 characters" });
            }

            const salt = await bcrypt.genSalt(10);
            update.password_hash = await bcrypt.hash(newPassword, salt);
        }

        if (typeof firstName === "string") update.first_name = firstName;
        if (typeof lastName === "string") update.last_name = lastName;

        const nameRegex = /\d/;
        if ((typeof firstName === "string" && nameRegex.test(firstName)) || 
            (typeof lastName === "string" && nameRegex.test(lastName))) {
            return res.status(400).json({ success: false, error: "First and last names cannot contain numbers" });
        }

        if (typeof email === "string") {
            const normalizedEmail = String(email).trim().toLowerCase();
            if (normalizedEmail && normalizedEmail !== prev.email) {
                const exists = await User.findOne({ email: normalizedEmail, _id: { $ne: id } });
                if (exists) {
                    return res.status(409).json({ success: false, error: "Email already in use" });
                }
                update.email = normalizedEmail;
            }
        }
        if (typeof role === "string") {
            const newDbRole = mapRoleToDb(role);
            update.role = newDbRole;
            // If role changed, regenerate the employee_id with the new prefix
            const prevDbRole = prev.role;
            if (prevDbRole !== newDbRole) {
                // Determine isSeniorFaculty: use incoming value or keep existing
                const seniorFlag = (typeof req.body.isSeniorFaculty === "boolean")
                    ? req.body.isSeniorFaculty
                    : (!!prev.is_senior_faculty);
                try {
                    update.employee_id = await generateEmployeeId(newDbRole, newDbRole === "FACULTY" && seniorFlag);
                } catch (err) {
                    console.error("[updateUser] Failed to regenerate employee_id:", err);
                }
            }
        }
        if (typeof req.body.isSeniorFaculty === "boolean") {
            update.is_senior_faculty = req.body.isSeniorFaculty;
        }
        if (typeof college === "string") update.college = college;
        if (typeof department === "string") update.department = department;
        if (typeof status === "string") {
            update.status = status.toLowerCase() === "archived" ? "ARCHIVED" : "ACTIVE";
            update.is_active = status.toLowerCase() !== "archived";
        }
        if (typeof isActive === "boolean") update.is_active = isActive;
        if (typeof isLocked === "boolean" && isAdmin) update.is_locked = isLocked;
        if (typeof notificationsEnabled === "boolean") update.notifications_enabled = notificationsEnabled;
        if (typeof theme === "string") update.theme_preference = theme === "dark" ? "dark" : "light";
        update.updated_at = new Date();

        const incomingStatus = (typeof status === "string") ? status.toLowerCase() : null;
        if (rejectRegistration === true || (prev.is_active === false && incomingStatus === "archived")) {
            await createForUser(
                id, 
                "Registration Rejected", 
                "Your registration has been rejected by Admin",
                null,
                "Your registration has been rejected by Admin. If you believe this is a mistake, please contact the administrator."
            );
            await User.findByIdAndDelete(id);
            if (global.io) global.io.emit("update_users");
            return res.json({ success: true, deleted: true });
        }

        const u = await User.findByIdAndUpdate(id, update, { new: true });
        if (!u) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // Check if the requester is the user themselves
        const isSelfUpdate = selfUpdate === true || (requesterId && requesterId === id);

        if (isSelfUpdate) {
            if (global.io) global.io.emit("update_users");
            return res.json({ success: true, user: toClientUser(u) });
        }
        const becameActive = prev.is_active === false && u.is_active === true;
        if (becameActive) {
            const clientUrl = process.env.CLIENT_URL || "http://localhost:8080";
            const loginLink = `${clientUrl}/login`;
            await createForUser(
                u._id, 
                "Account Approved", 
                "Your account has been approved by Admin",
                null,
                `Your account has been approved by Admin. You can now access the system.\n\nLogin here: ${loginLink}`
            );
        } else {
            await createForUser(
                u._id, 
                "Account Updated", 
                "Your account information has been updated by Admin"
            );
        }
        if (global.io) global.io.emit("update_users");
        return res.json({ success: true, user: toClientUser(u) });
    } catch (err) {
        return res.status(500).json({ success: false, error: "Failed to update user" });
    }
}

async function deleteUser(req, res) {
    try {
        const { id } = req.params;
        const u = await User.findByIdAndDelete(id);
        if (!u) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if (global.io) global.io.emit("update_users");
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: "Failed to delete user" });
    }
}

module.exports = { listUsers, getUser, updateUser, deleteUser };
