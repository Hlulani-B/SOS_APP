/**
 * audioSend - emails an audio-recording alert to emergency contacts via
 * Resend, with the recording itself attached as a base64 file. The
 * recording is also saved to the device by audioDownload. Kept as a thin
 * wrapper so the AudioRecorder component's pipeline (and signature) stays
 * untouched.
 */

import { sendAlertEmail, blobToBase64 } from './sendAlert';
import { getMapsLink } from './location';

export async function audioSend(blob, userEmail = "user@example.com") {
  try {
    // Get user profile
    const userProfile = JSON.parse(localStorage.getItem("user_profile") || "{}");
    const userName = `${userProfile.firstName || ""} ${userProfile.surname || ""}`.trim();
    const customMessage = userProfile.customMessage || "I need help.";

    // Build the attachment. Any failure here is logged and the alert still
    // goes out without the file - the email must never be lost.
    let attachments = [];
    if (blob && blob.size > 0) {
      try {
        const content = await blobToBase64(blob);
        // Name and type must match what was actually recorded (m4a when the
        // browser recorded mp4, webm otherwise) or mail apps refuse the file
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        attachments = [
          {
            filename: `emergency-audio-${Date.now()}.${ext}`,
            content,
            content_type: (blob.type || "audio/webm").split(";")[0]
          }
        ];
        console.log(`Audio recording attached (${(blob.size / 1024).toFixed(0)}KB, ${ext})`);
      } catch (attachmentError) {
        console.error("Could not attach the recording - sending the alert without it:", attachmentError);
      }
    } else {
      console.warn("No recording data captured - sending the alert without an attachment.");
    }

    const mapsLink = await getMapsLink();

    await sendAlertEmail(
      `EMERGENCY ALERT from ${userName}`,
      `EMERGENCY ALERT from ${userName}\n\n${customMessage}\n\nLocation: ${mapsLink}\n\nAudio recording triggered. The recording has been saved on the device.`,
      attachments
    );
  } catch (error) {
    console.error("Error in audioSend:", error);
  }
}
