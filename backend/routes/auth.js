const express = require("express");
const router = express.Router();
const recaptchaVerify = require("../middleware/recaptcha");
const { login, register, forgotPassword, resetPassword } = require("../controllers/authController");
const { loginWithGoogleToken, googleAuthorize, googleCallback } = require("../controllers/googleAuthController");
const { verifyRecaptcha } = require("../controllers/recaptchaController");

// Manual login still uses reCAPTCHA, but register/signup does not
router.post("/login", recaptchaVerify, login);
router.post("/register", register);
router.post("/google", loginWithGoogleToken);
router.get("/google/authorize", googleAuthorize);
router.get("/google/callback", googleCallback);
router.post("/recaptcha", verifyRecaptcha);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
