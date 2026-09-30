/**
 * sendAlert: shared email dispatcher for all three alert paths (SOS, audio,
 * video) over EmailJS.
 *
 * Setup (one time, in the EmailJS dashboard):
 *   1. connect an email service (any mailbox you control)
 *   2. create an email template with:
 *        To         = {{to_email}}
 *        Subject    = {{subject}}
 *        message    = {{message}}
 *      and under the template's Attachments tab add a Variable Attachment
 *      with the parameter name "attachment".
 *   3. copy the three ids into .env as VITE_EMAILJS_SERVICE_ID,
 *      VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY, and set the same
 *      three on the Render service before deploying.
 *
 * Attachments: audioSend/videoSend pass the recording as base64 through the
 * third argument. Anything above MAX_ATTACHMENT_BYTES is dropped and
 * explained in the email body instead, because the alert itself must ALWAYS
 * go out.
 */

import emailjs from '@emailjs/browser';
import { get_pals } from './apiPals.js';

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";
const ALERT_FROM_NAME = import.meta.env.VITE_ALERT_FROM_NAME || "Weather App";

// EmailJS's free plan caps ALL template variables (message + attachment +
// subject + to_email + from_name) at 50 KB combined. The base64 attachment
// dominates, so we keep it under ~35 KB to leave headroom for the other
// fields (~1 KB). Anything above this is uploaded to catbox.moe and the
// email carries a download link instead, so the evidence still gets off
// the device even if it is later destroyed.
const MAX_ATTACHMENT_BYTES = 35 * 1024;

// Converts a Blob into a plain base64 string, the interchange format the
// alert wrappers (audioSend/videoSend) use. Encodes the raw bytes directly
// instead of parsing a data: URL, because a mime type like
// "video/webm;codecs=vp8,opus" contains a comma before the base64 payload
// and corrupts the extracted string.
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

// EmailJS sends its params as JSON, so a File object would become {} and the
// attachment would silently vanish. It expects a base64 data URL string.
function base64ToDataUrl(content, mimeType) {
  return `data:${mimeType || "application/octet-stream"};base64,${content}`;
}

// Uploads a Blob via the API proxy (which forwards to catbox.moe server-to-
// server, bypassing browser CORS restrictions). Returns the download URL on
// success, or null when the upload fails so the caller can fall back to the
// direct-attachment path or a "saved on device" note.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function uploadRecording(blob) {
  try {
    const filename = `evidence-${Date.now()}.webm`;
    const resp = await fetch(`${API_BASE}/api/upload?filename=${encodeURIComponent(filename)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: await blob.arrayBuffer()
    });
    if (!resp.ok) {
      console.warn(`upload proxy HTTP ${resp.status}`);
      return null;
    }
    const json = await resp.json();
    if (json.ok && json.url && json.url.startsWith("https://")) {
      console.log(`Recording uploaded (${(blob.size / 1024).toFixed(0)}KB): ${json.url}`);
      return json.url;
    }
    console.warn("upload proxy returned unexpected response:", json);
    return null;
  } catch (err) {
    console.warn("upload failed:", err.message || err);
    return null;
  }
}

// Turns a raw EmailJS failure into readable text with a hint on the fix.
function explainEmailJSError(raw) {
  const toText = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  const msg =
    raw && (raw.text || raw.message)
      ? `${raw.status ? raw.status + " " : ""}${toText(raw.text || raw.message)}`
      : toText(raw) || "unknown error";

  // Missing or mistyped public key
  if (/invalid public key|public key/i.test(msg)) {
    return `${msg} -> FIX: copy the key from EmailJS -> Accounts -> API Keys into .env as VITE_EMAILJS_PUBLIC_KEY and rebuild.`;
  }

  // Attachment or request too large
  if (/413|too large|payload|size/i.test(msg)) {
    return `${msg} -> FIX: the attachment is over your EmailJS plan's size limit.`;
  }

  // Template variables not set up
  if (/parameters are invalid|missing parameter|template/i.test(msg)) {
    return `${msg} -> FIX: the EmailJS template must define To={{to_email}}, Subject={{subject}}, the body must contain {{message}}, and the attachment slot must use {{attachment}}.`;
  }

  // Monthly quota exhausted (free tier is 200 emails per month)
  if (/quota|limit exceeded|too many/i.test(msg)) {
    return `${msg} -> FIX: the EmailJS free tier allows 200 emails per month; check the dashboard usage ring.`;
  }

  // Service mailbox disconnected
  if (/service|mailbox|authentication/i.test(msg) && !/parameters/i.test(msg)) {
    return `${msg} -> FIX: reconnect the email service in the EmailJS dashboard (the connected mailbox password or OAuth went stale).`;
  }

  return msg;
}

export async function sendAlertEmail(subject, text, attachments = []) {
  // Recipients are the signed-in user's trusted pals, read live from the
  // backend so an invite accepted on another device is reflected the next
  // time an alert fires.
  const email = localStorage.getItem("sos_email");
  if (!email) {
    console.warn("sendAlertEmail: no signed-in email, cannot resolve recipients.");
    return false;
  }

  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    console.error(
      "sendAlertEmail: EmailJS is not configured. Set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID and VITE_EMAILJS_PUBLIC_KEY in .env (local) and on the Render service (production)."
    );
    return false;
  }

  let recipients = [];
  try {
    const pals = await get_pals(email);
    // get_pals returns a plain email[]; dedupe and keep only real addresses.
    recipients = [
      ...new Set(
        (pals || [])
          .map((e) => String(e).trim())
          .filter((v) => v.includes("@"))
      )
    ];
  } catch (err) {
    console.error(`sendAlertEmail: could not load pals for ${email}:`, err.message || err);
    return false;
  }

  if (recipients.length === 0) {
    console.warn("No trusted contacts (pals) on the backend - add some before an alert can be sent.");
    return false;
  }

  // "It must always send": the recording must get off the device because
  // if the device is destroyed the evidence is lost. Three tiers:
  //   1. Small enough for EmailJS (≤35 KB base64) → direct attachment
  //   2. Too large → upload to catbox.moe, email carries download link
  //   3. Upload fails → alert text still sends, recording saved on device
  let finalText = text;
  let safeAttachments = [];
  let recordingUrl = null;
  if (attachments.length > 0) {
    const totalBytes = attachments.reduce(
      (sum, a) => sum + String(a.content || "").length,
      0
    );
    if (totalBytes <= MAX_ATTACHMENT_BYTES) {
      // Tier 1: fits inside EmailJS variables directly
      safeAttachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.content_type ? { content_type: a.content_type } : {})
      }));
      finalText += "\n\nThe recording is attached to this email.";
    } else {
      // Tier 2: too large for EmailJS - upload to catbox for a download link
      console.warn(
        `Attachment too large for EmailJS (${(totalBytes / 1024).toFixed(0)}KB base64, limit ${MAX_ATTACHMENT_BYTES / 1024}KB). Uploading to file host...`
      );
      if (attachments[0].blob) {
        recordingUrl = await uploadRecording(attachments[0].blob);
      }
      if (recordingUrl) {
        finalText += `\n\nRecording (${(totalBytes / 1024).toFixed(0)}KB): ${recordingUrl}`;
      } else {
        // Tier 3: upload failed - at least the alert text still goes out
        finalText +=
          "\n\nThe recording was too large to email and could not be uploaded; it has been saved on the device.";
      }
    }
  }

  let sent = 0;
  for (const to of recipients) {
    const params = {
      to_email: to,
      subject,
      message: finalText,
      from_name: ALERT_FROM_NAME
    };
    if (safeAttachments.length > 0) {
      const first = safeAttachments[0];
      params.attachment = base64ToDataUrl(first.content, first.content_type);
    }

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, {
        publicKey: EMAILJS_PUBLIC_KEY
      });
      sent++;
    } catch (error) {
      console.error(`Failed to send to ${to}:`, explainEmailJSError(error));

      // If the attachment was the problem, retry once without it so the
      // alert text and location still reach the contact.
      if (params.attachment) {
        try {
          delete params.attachment;
          params.message += "\n\n(The recording could not be attached; it is saved on the device.)";
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params, {
            publicKey: EMAILJS_PUBLIC_KEY
          });
          sent++;
        } catch (retryError) {
          console.error(`Retry without attachment also failed for ${to}:`, explainEmailJSError(retryError));
        }
      }
    }
  }

  console.log(`Alert email sent to ${sent}/${recipients.length} contact(s)`);
  return sent > 0;
}