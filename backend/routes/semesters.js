const express = require("express");
const router = express.Router();
const { getSemesters, addSemester, updateSemester, deleteSemester, resetToDefaults } = require("../controllers/semestersController");

router.get("/", getSemesters);
router.post("/", addSemester);
router.post("/reset", resetToDefaults);
router.put("/:id", updateSemester);
router.delete("/:id", deleteSemester);

module.exports = router;
