/**
 * api/emails.js - Vercel serverless function for PRODUCTION alert delivery.
 *
 * In development the Vite dev proxy forwards /api/emails to api.resend.com
 * (see vite.config.js), but a deployed static build has no dev server, so
 * this function takes over the exact same path. The client code is
 * therefore identical in dev and production: it POSTs to same-origin
 * /api/emails and never touches the API key - the key is read from the
 * deployment's RESEND_API_KEY environment variable here, server-side.
 *
 * Vercel caps request bodies at ~4.5MB, which is why sendAlert.js sizes
 * its attachment guard at 4MB (base64) - smaller than Resend's own 40MB
 * limit, so an oversized recording is dropped gracefully client-side and
 * the alert itself always sends.
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ message: "RESEND_API_KEY is not configured on the deployment - add it under Environment Variables" });
  }

  // Vercel parses JSON bodies automatically; accept a raw string as well
  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (e) {
      return res.status(400).json({ message: "Invalid JSON body" });
    }
  }

  try {
    const upstream = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    // Pass Resend's status and body through unchanged so the client's
    // existing error explainer (explainResendError) keeps working
    const body = await upstream.text();
    res.setHeader("Content-Type", "application/json");
    return res.status(upstream.status).send(body);
  } catch (error) {
    return res.status(502).json({ message: "Failed to reach the email service" });
  }
}
