/**
 * SOS Helper - emails SOS alerts with GPS location to the user's pals
 * via EmailJS.
 *
 * SOSsend(fallbackNumbers, onStatusUpdate) keeps its original signature so
 * SOSButton needs no changes. IMPORTANT: onStatusUpdate is a COMPLETION
 * callback - SOSButton resolves its recording-lock promise on the first call,
 * so it must only fire once every email has been attempted. Intermediate
 * progress goes to the console instead.
 */

import { sendAlertEmail } from '../functions/sendAlert';
import { getMapsLink } from '../functions/location';

export function SOSsend(fallbackNumbers, onStatusUpdate) {
  // Contacts come only from localStorage (read inside sendAlertEmail) -
  // fallbackNumbers is accepted for signature compatibility but ignored.
  sendSOSAlert(onStatusUpdate);
}

async function sendSOSAlert(onStatusUpdate) {
  // Get user profile
  const userProfile = JSON.parse(localStorage.getItem("user_profile") || "{}");
  const toStr = (v) => (typeof v === "string" ? v : v != null ? String(v) : "");
  const firstName = toStr(userProfile.firstName).trim();
  const surname = toStr(userProfile.surname).trim();
  const userName = `${firstName} ${surname}`.trim() || "Someone";
  const rawCustom = toStr(userProfile.customMessage).trim();
  const customMessage = rawCustom && rawCustom !== "[object Object]" ? rawCustom : "I need help.";
  const userEmail = localStorage.getItem("sos_email") || "";

  console.log("Acquiring location...");
  const mapsLink = await getMapsLink();

  console.log("Sending alerts...");

  let ok = false;
  try {
    ok = await sendAlertEmail(
      `Emergency Alert - ${userName}`,
      [
        "Weather App - Emergency Alert",
        "",
        `Name: ${userName}`,
        `Email: ${userEmail}`,
        `Time: ${new Date().toLocaleString()}`,
        "",
        `Message: ${customMessage}`,
        "",
        `Location: ${mapsLink}`,
        "",
        "This is an SOS alert. If you cannot reach the person, please contact local authorities."
      ].join("\n")
    );
  } catch (error) {
    console.error("Error dispatching SOS alert:", error);
  }

  // Completion signal - this releases SOSButton's recording lock
  onStatusUpdate(ok ? "SOS sent" : "SOS could not be sent");
}
