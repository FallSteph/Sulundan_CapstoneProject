const express = require("express");
const router = express.Router();
const { listTemplates, createTemplate, activateTemplate } = require("../controllers/templatesController");

router.get("/", listTemplates);
router.post("/", createTemplate);
router.patch("/:id/activate", activateTemplate);

module.exports = router;
