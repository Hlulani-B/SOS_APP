/**
 * Share-start notifications: a heads-up when a pal comes online (starts
 * sharing their location). There is no push infrastructure in this app
 * (no FCM, no web service worker), so the notification is produced entirely
 * client-side the instant the pals poll sees a pal turn online.
 *
 * On the APK: Capacitor.Plugins.LocalNotifications fires a real native
 * notification (accessed through the Capacitor plugin bridge, not via
 * ES module import - that would be externalized by vite for the web build).
 * On the website: the browser Notification API is used instead.
 * The call sites stay identical - nothing in Location.jsx needs to know which
 * surface it is running on.
 *
 * "Only once" is enforced by the CALLER (Location.jsx tracks the set of emails
 * it has already announced and clears an email only when that pal goes
 * offline), so a continuing share never re-pings; a fresh share after they went
 * quiet counts as a new event and announces again.
 */
import { Capacitor } from "@capacitor/core";

const IS_NATIVE = Capacitor.isNativePlatform();

// Access the native notification plugin through the Capacitor bridge.
// This works on the APK where the plugin is registered, and returns undefined
// on the web where it isn't. No ES module import needed (which would be
// externalized by vite and break at runtime).
function nativeNotif() {
  if (!IS_NATIVE) return null;
  return Capacitor.Plugins?.LocalNotifications || null;
}

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
    if (IS_NATIVE) {
      const mod = nativeNotif();
      if (mod) await mod.requestPermissions();
    } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
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
    if (IS_NATIVE) {
      const mod = nativeNotif();
      if (!mod) {
        console.warn("LocalNotifications plugin not available");
        return;
      }
      const result = await mod.schedule({
        notifications: [
          {
            id: notifId(email),
            title: "Location shared",
            body: `${who} shared their location`,
            smallColor: "#3b82f6",
          },
        ],
      });
      console.log("Notification scheduled:", result);
    } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Location shared", { body: `${who} shared their location` });
    }
  } catch (err) {
    console.warn("Notification failed:", err.message || err);
    /* scheduling failed (no permission / unsupported) - presence still shows
       on the map, so the notification is a pure convenience layer */
  }
}
