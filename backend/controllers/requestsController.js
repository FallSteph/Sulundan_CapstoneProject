const ChangeRequest = require("../models/ChangeRequest");
const User = require("../models/User");
const { createForAdmins, createForUser, sendEmail } = require("./notificationsController");

function mapRoleToDb(clientRole) {
  const roleMap = {
    faculty: "FACULTY",
    dept_head: "DEPT_HEAD",
    dean: "DEAN",
    citl: "CITL",
    vpaa: "VPAA",
  };
  return roleMap[clientRole] || null;
}

async function createRequest(req, res) {
  try {
    const { userId, type, requestedRole, requestedCollege, requestedDepartment } = req.body || {};
    if (!userId || !type) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    if (!["role", "college_department", "both"].includes(String(type))) {
      return res.status(400).json({ success: false, error: "Invalid request type" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const cr = new ChangeRequest({
      user_id: user._id,
      type,
      requested_role: type === "role" || type === "both" ? (mapRoleToDb(requestedRole) || null) : null,
      requested_college: type === "college_department" || type === "both" ? (requestedCollege || "") : "",
      requested_department: type === "college_department" || type === "both" ? (requestedDepartment || "") : "",
      status: "PENDING",
      created_at: new Date(),
      updated_at: new Date(),
    });
    await cr.save();
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    const details = [];
    if (cr.type === "role" || cr.type === "both") {
      details.push(`Role: ${requestedRole}`);
    }
    if (cr.type === "college_department" || cr.type === "both") {
      details.push(`College/Dept: ${requestedCollege || ""} / ${requestedDepartment || ""}`);
    }
    const message = `User ${fullName} (${user.email}) submitted a change request.\nType: ${cr.type}\n${details.join("\n")}`;
    await createForAdmins("New Change Request", message);
    
    if (global.io) {
      global.io.emit("update_requests");
    }
    
    return res.json({ success: true, requestId: String(cr._id) });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to create request" });
  }
}

async function listRequests(req, res) {
  try {
    const status = (req.query?.status || "PENDING").toString().toUpperCase();
    const items = await ChangeRequest.find({ status }).sort({ created_at: -1 });
    const userIds = [...new Set(items.map(i => String(i.user_id)))];
    const users = await User.find({ _id: { $in: userIds } }, { first_name: 1, last_name: 1, email: 1 });
    const userMap = new Map(users.map(u => [String(u._id), u]));
    const mapped = items.map(i => {
      const u = userMap.get(String(i.user_id));
      return {
        id: String(i._id),
        userId: String(i.user_id),
        userName: u ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : "",
        userEmail: u?.email || "",
        type: i.type,
        requestedRole: i.requested_role,
        requestedCollege: i.requested_college,
        requestedDepartment: i.requested_department,
        status: i.status,
        createdAt: i.created_at,
        updatedAt: i.updated_at,
      };
    });
    return res.json({ success: true, requests: mapped });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to load requests" });
  }
}

async function updateRequest(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    const cr = await ChangeRequest.findById(id);
    if (!cr) {
      return res.status(404).json({ success: false, error: "Request not found" });
    }
    if (cr.status !== "PENDING") {
      return res.status(400).json({ success: false, error: "Request already processed" });
    }
    if (action === "approve") {
      const user = await User.findById(cr.user_id);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      const update = {};
      if (cr.type === "role" || cr.type === "both") {
        if (cr.requested_role) update.role = cr.requested_role;
      }
      if (cr.type === "college_department" || cr.type === "both") {
        if (cr.requested_college) update.college = cr.requested_college;
        if (cr.requested_department) update.department = cr.requested_department;
      }
      update.updated_at = new Date();
      await User.findByIdAndUpdate(user._id, update);
      cr.status = "APPROVED";
      cr.updated_at = new Date();
      await cr.save();
      await createForUser(
          user._id, 
          "Change Request Approved", 
          "Your change request has been approved by Admin",
          null,
          "Your request to change your role/assignment has been approved."
      );
      
      if (global.io) {
        global.io.emit("update_requests");
        global.io.emit("update_users");
      }
      
      return res.json({ success: true, request: { id: String(cr._id), status: cr.status } });
    }
    if (action === "reject") {
      cr.status = "REJECTED";
      cr.updated_at = new Date();
      await cr.save();
      const user = await User.findById(cr.user_id);
      if (user) {
        await createForUser(
            user._id, 
            "Change Request Rejected", 
            "Your change request has been rejected by Admin",
            null,
            "Your request to change your role/assignment has been rejected. Please contact Admin if you have questions."
        );
      }
      
      if (global.io) {
        global.io.emit("update_requests");
      }
      
      return res.json({ success: true, request: { id: String(cr._id), status: cr.status } });
    }
    return res.status(400).json({ success: false, error: "Invalid action" });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to update request" });
  }
}

module.exports = { createRequest, listRequests, updateRequest };
