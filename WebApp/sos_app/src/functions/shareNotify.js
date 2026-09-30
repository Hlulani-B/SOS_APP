/**
 * Share-start notifications: a heads-up when a pal comes online (starts
 * sharing their location). There is no push infrastructure in this app
 * (no FCM, no web service worker), so the notification is produced entirely
 * client-side the instant the pals poll sees a pal turn online.
 *
 * @capacitor/local-notifications is used on BOTH surfaces: on the APK it is a
 * real native notification, and on the website its bundled web layer calls the
 * browser Notification API - so the call sites stay identical and nothing here
 * breaks the browser bundle.
 *
 * "Only once" is enforced by the CALLER (Location.jsx tracks the set of emails
 * it has already announced and clears an email only when that pal goes
 * offline), so a continuing share never re-pings; a fresh share after they went
 * quiet counts as a new event and announces again.
 */
import { LocalNotifications } from "@capacitor/local-notifications";

// Ask for permission at most once per session; the system dialog should not
// fire on every poll tick.
let permissionRequested = false;

/** Stable positive id per email so repeat notifications for the same pal
 *  replace rather than stack up indefinitely. */
function notifId(key) {
  let h = 0;
  const s = String(key || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return (h % 1000000000) || 1;
}

/** Best-effort permission prompt. Never throws - a denied notification is not
 *  worth breaking the location screen. */
export async function ensureNotifyPermission() {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    await LocalNotifications.requestPermissions();
  } catch {
    /* permission prompt unavailable/denied */
  }
}

/**
 * Announce that a pal has started sharing their location.
 * @param {string} email  pal email (used for the stable notification id)
 * @param {string} [name] display name; falls back to the email
 */
export async function notifyShareStart(email, name) {
  const who = (name && String(name).trim()) || email || "Someone";
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifId(email),
          title: "Location shared",
          body: `${who} shared their location`,
          smallColor: "#ff3b30",
        },
      ],
    });
  } catch {
    /* scheduling failed (no permission / unsupported) - presence still shows
       on the map, so the notification is a pure convenience layer */
  }
}
