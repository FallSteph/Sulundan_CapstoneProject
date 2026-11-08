const express = require("express");
const router = express.Router();
const { listUsers, getUser, updateUser, deleteUser } = require("../controllers/usersController");

router.get("/", listUsers);
router.get("/:id", getUser);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
