/**
 * SOS Helper - emails SOS alerts with GPS location to emergency contacts
 * via Resend.
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
  const userName = `${userProfile.firstName || ""} ${userProfile.surname || ""}`.trim();
  const customMessage = userProfile.customMessage || "I need help.";

  console.log("Acquiring location...");
  const mapsLink = await getMapsLink();

  console.log("Sending alerts...");

  let ok = false;
  try {
    ok = await sendAlertEmail(
      `EMERGENCY SOS from ${userName}`,
      `EMERGENCY SOS from ${userName}\n\n${customMessage}\n\nLocation: ${mapsLink}`
    );
  } catch (error) {
    console.error("Error dispatching SOS alert:", error);
  }

  // Completion signal - this releases SOSButton's recording lock
  onStatusUpdate(ok ? "SOS sent" : "SOS could not be sent");
}
