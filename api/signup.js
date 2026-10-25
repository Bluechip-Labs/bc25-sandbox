// Vercel serverless function: capture a waitlist email.
// Flexible store: forwards to SIGNUP_WEBHOOK_URL if set (e.g. a Google Apps Script,
// Zapier, or form service); else writes to Vercel KV / Upstash if configured; else
// logs to the function output. Always returns ok so a user is never lost on a glitch.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const email = ((body && body.email) || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ ok: false, error: "invalid email" });
    return;
  }
  const record = { email, ts: new Date().toISOString(), ua: req.headers["user-agent"] || "" };
  try {
    const hook = process.env.SIGNUP_WEBHOOK_URL;
    if (hook) {
      await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
    } else if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      await fetch(
        process.env.KV_REST_API_URL + "/sadd/bc25_signups/" + encodeURIComponent(email),
        { headers: { Authorization: "Bearer " + process.env.KV_REST_API_TOKEN } }
      );
    } else {
      console.log("BC25 signup:", JSON.stringify(record));
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.log("BC25 signup error:", String(e), JSON.stringify(record));
    res.status(200).json({ ok: true }); // never lose a lead on a backend hiccup
  }
}
