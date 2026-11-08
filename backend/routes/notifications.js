const express = require("express");
const router = express.Router();
const { listByUser, markRead, createNotification } = require("../controllers/notificationsController");

router.get("/:userId", listByUser);
router.get("/", listByUser);
router.post("/", createNotification);
router.post("/:id/read", markRead);

module.exports = router;
