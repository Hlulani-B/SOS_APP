/**
 * videoSend - emails a video-recording alert to the user's pals via
 * EmailJS, with the recording itself attached as a base64 file. The
 * recording is also saved to the device by videoDownload. Kept as a thin
 * wrapper so the VideoRecorder component's pipeline (and signature) stays
 * untouched.
 */

import { sendAlertEmail, blobToBase64 } from './sendAlert';
import { getMapsLink } from './location';

export async function videoSend(blob, userEmail = "user@example.com") {
  try {
    // Get user profile. Every field is coerced to a string so that a stale
    // or malformed localStorage entry (e.g. customMessage stored as an
    // object) cannot leak "[object Object]" into the emergency email.
    const userProfile = JSON.parse(localStorage.getItem("user_profile") || "{}");
    const toStr = (v) => (typeof v === "string" ? v : v != null ? String(v) : "");
    const firstName = toStr(userProfile.firstName).trim();
    const surname = toStr(userProfile.surname).trim();
    const userName = `${firstName} ${surname}`.trim() || "Someone";
    const rawCustom = toStr(userProfile.customMessage).trim();
    const customMessage = rawCustom && rawCustom !== "[object Object]" ? rawCustom : "I need help.";

    // Build the attachment. Any failure here is logged and the alert still
    // goes out without the file - the email must never be lost.
    let attachments = [];
    if (blob && blob.size > 0) {
      try {
        const content = await blobToBase64(blob);
        // Name and type must match what was actually recorded (mp4 when the
        // browser recorded mp4, webm otherwise) or mail apps refuse the file
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        attachments = [
          {
            filename: `emergency-recording-${Date.now()}.${ext}`,
            content,
            content_type: (blob.type || "video/webm").split(";")[0],
            blob  // original Blob kept for catbox upload when base64 exceeds EmailJS 50KB limit
          }
        ];
        console.log(`Video recording attached (${(blob.size / 1024).toFixed(0)}KB, ${ext})`);
      } catch (attachmentError) {
        console.error("Could not attach the recording - sending the alert without it:", attachmentError);
      }
    } else {
      console.warn("No recording data captured - sending the alert without an attachment.");
    }

    const mapsLink = await getMapsLink();

    await sendAlertEmail(
      `EMERGENCY ALERT from ${userName}`,
      `EMERGENCY ALERT from ${userName}\n\n${customMessage}\n\nLocation: ${mapsLink}\n\nVideo recording triggered. The recording has been saved on the device.`,
      attachments
    );
  } catch (error) {
    console.error("Error in videoSend:", error);
  }
}
