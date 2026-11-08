const express = require("express");
const router = express.Router();
const { createRequest, listRequests, updateRequest } = require("../controllers/requestsController");

router.post("/", createRequest);
router.get("/", listRequests);
router.patch("/:id", updateRequest);

module.exports = router;
