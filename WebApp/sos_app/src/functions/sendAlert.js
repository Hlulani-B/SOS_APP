/**
 * sendAlert - shared email dispatcher for all three alert paths (SOS, audio,
 * video). The browser posts to /api/emails (same origin, so no CORS); the
 * Vite dev server proxies that to api.resend.com and attaches the API key
 * server-side, keeping the key out of the client bundle entirely.
 *
 * Free-tier rules to remember (no custom domain):
 *   - the "from" address must be onboarding@resend.dev
 *   - delivery is ONLY to the email address you signed up to Resend with;
 *     any other recipient is rejected until you verify a domain
 *
 * The API key lives in sos/.env as RESEND_API_KEY (no VITE_ prefix on
 * purpose - it must never reach the browser). After pasting the key the
 * dev server must be restarted so the proxy picks it up.
 *
 * Attachments: audioSend/videoSend pass the recording as base64 through the
 * third argument. Resend allows max 40MB of attachments AFTER base64
 * encoding - anything above MAX_ATTACHMENT_BYTES is dropped and explained
 * in the email body instead, because the alert itself must ALWAYS go out.
 */

const RESEND_ENDPOINT = "/api/emails";
const ALERT_FROM = import.meta.env.VITE_ALERT_FROM_EMAIL || "Safe <onboarding@resend.dev>";

// Sized for the strictest hop in the delivery path: Vercel serverless
// functions cap request bodies at ~4.5MB (Resend itself allows 40MB, and
// the dev proxy has no limit, so production is the constraint). Oversized
// attachments are dropped with a note in the email body - the alert
// itself always sends.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

// Converts a Blob into a plain base64 string - the format Resend expects in
// attachments[].content. Encodes the raw bytes directly instead of parsing a
// data: URL: data URLs embed the blob's mime type, and a type like
// "video/webm;codecs=vp8,opus" contains a comma BEFORE the base64 payload,
// which corrupted the extracted string and made every video attachment an
// unopenable file.
export function blobToBase64(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    // String.fromCharCode.apply cannot take the whole array at once (call
    // stack limit), so encode in 32KB chunks
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  });
}

// Turns a raw Resend error body into a plain-English hint with the FIX
function explainResendError(raw) {
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return raw;
  }
  const msg = String(
    parsed.message || (parsed.error && parsed.error.message) || raw
  );

  // Free tier: recipient is not the address you signed up with
  if (/own email|testing emails|trial mode/i.test(msg)) {
    return `${msg} -> FIX: on the Resend free tier (no verified domain) you can only send to the email address you signed up with. Use that address as your test contact, or add and verify a domain in the Resend dashboard.`;
  }

  // Missing/wrong API key
  if (/invalid api key|unauthorized/i.test(msg)) {
    return `${msg} -> FIX: paste your Resend API key (re_...) into sos/.env as RESEND_API_KEY and restart the dev server.`;
  }

  return msg;
}

export async function sendAlertEmail(subject, text, attachments = []) {
  // Contacts come only from localStorage - nothing is hardcoded
  const stored = localStorage.getItem("sa_sos_contacts");
  let contacts = [];
  if (stored) {
    try {
      contacts = JSON.parse(stored);
    } catch (e) {}
  }

  if (contacts.length === 0) {
    console.warn("No emergency contacts found.");
    return false;
  }

  // New contacts store an email; older rows may have used the phone field
  const recipients = [
    ...new Set(
      contacts
        .map((c) => (c.email || c.phone || "").trim())
        .filter((v) => v.includes("@"))
    )
  ];

  if (recipients.length === 0) {
    console.warn("No contact has an email address - add one on the setup page.");
    return false;
  }

  // "It must always send": if an attachment would break the request (Resend
  // caps attachments at 40MB after base64), drop it and say so in the body
  // instead of losing the whole alert.
  let finalText = text;
  let safeAttachments = [];
  if (attachments.length > 0) {
    const totalBytes = attachments.reduce(
      (sum, a) => sum + String(a.content || "").length,
      0
    );
    if (totalBytes <= MAX_ATTACHMENT_BYTES) {
      safeAttachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.content_type ? { content_type: a.content_type } : {})
      }));
      finalText += "\n\nThe recording is attached to this email.";
    } else {
      console.warn(
        `Attachment too large to email (${(totalBytes / 1024 / 1024).toFixed(1)}MB base64) - sending the alert without it.`
      );
      finalText +=
        "\n\nThe recording was too large to attach to this email; it has been saved on the device.";
    }
  }

  let sent = 0;
  for (const to of recipients) {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: ALERT_FROM,
          to: [to],
          subject,
          text: finalText,
          ...(safeAttachments.length > 0 ? { attachments: safeAttachments } : {})
        })
      });

      if (response.ok) {
        sent++;
      } else {
        console.error(`Failed to send to ${to}:`, explainResendError(await response.text()));
      }
    } catch (error) {
      console.error(`Error sending to ${to}:`, error);
    }
  }

  console.log(`Alert email sent to ${sent}/${recipients.length} contact(s)`);
  return sent > 0;
}
