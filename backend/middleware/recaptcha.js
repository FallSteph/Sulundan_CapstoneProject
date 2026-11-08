const fetch = global.fetch || require("node-fetch");

module.exports = async function recaptchaVerify(req, res, next) {
  try {
    const token = req.body?.recaptchaToken || req.body?.token;
    if (!token) {
      return res.status(400).json({ success: false, error: "Missing reCAPTCHA token" });
    }
    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, error: "RECAPTCHA_SECRET not configured" });
    }
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ success: false, error: "reCAPTCHA verification failed" });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, error: "Unable to verify reCAPTCHA" });
  }
}
