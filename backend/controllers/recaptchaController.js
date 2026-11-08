const fetch = global.fetch || require("node-fetch");

async function verifyRecaptcha(req, res) {
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
    return res.json({ success: !!data.success, data });
  } catch {
    return res.status(500).json({ success: false, error: "Verification failed" });
  }
}
 
module.exports = { verifyRecaptcha };
