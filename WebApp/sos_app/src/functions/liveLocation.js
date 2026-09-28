import { ShareLocation, StopLiveLocation } from "./apiLocation.js";

/**
 * Live-location sharing, kept outside React.
 *
 * The on/off state and the periodic ShareLocation tick used to live inside
 * SharelocationButton's useEffect. That meant the moment you navigated away
 * from the Location page, App.jsx unmounted the button, its cleanup ran
 * clearInterval, and sharing silently stopped - the opposite of what a
 * "share my live location" toggle is for.
 *
 * There is no router here (see navigation.js): switching views never reloads
 * the page, so a plain module-level timer survives every navigation. This
 * singleton owns the loop; components only read its state and ask it to
 * start/stop, so the Weather page (or anywhere else) keeps sharing.
 *
 * Surviving a refresh: a reload wipes the in-memory timer, so the sharing
 * email is also mirrored to localStorage (LIVE_KEY). App.jsx calls restore()
 * once on boot, which reads that flag and resumes the loop - so closing or
 * refreshing the tab no longer drops you off the map. The flag is cleared on
 * stop() and on logOut(), and restore() refuses to resume for an email that
 * doesn't match the signed-in session, so a leftover flag can never quietly
 * broadcast the wrong person's location.
 */

const INTERVAL_MS = 10000;
const LIVE_KEY = "sa_live_location";

let timer = null;
let activeEmail = null;
const listeners = new Set();

function emit() {
  const running = timer !== null;
  listeners.forEach((listener) => listener(running));
}

/** Whether sharing is live right now, on any page. */
export function isActive() {
  return timer !== null;
}

/** The email currently being shared for, or null. */
export function activeEmailFor() {
  return activeEmail;
}

// Shared by start() and restore(): fire one position immediately so the map
// updates at once rather than after the first idle 10s tick, then loop.
function beginLoop(email) {
  activeEmail = email;
  ShareLocation(email).catch((err) => console.error(err));
  timer = setInterval(() => {
    ShareLocation(activeEmail).catch((err) => console.error(err));
  }, INTERVAL_MS);
  emit();
}

/**
 * Begin sharing this email's position every INTERVAL_MS and remember it so a
 * refresh can resume. No-op if already sharing.
 */
export function start(email) {
  if (timer !== null) return;
  if (!email) {
    console.error("liveLocation.start: no email to share for");
    return;
  }
  localStorage.setItem(LIVE_KEY, email);
  beginLoop(email);
}

/**
 * Stop sharing, clear the stored coordinates, and drop the persistence flag.
 * Clears the flag even if no timer is running, so a stale entry can't linger.
 */
export function stop() {
  localStorage.removeItem(LIVE_KEY);
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
  const email = activeEmail;
  activeEmail = null;
  StopLiveLocation(email).catch((err) => console.error(err));
  emit();
}

/**
 * Resume a refresh-surviving share session. Call once at app boot with the
 * signed-in email. Does nothing when already sharing, when no flag is set, or
 * when the stored email belongs to a different account (that flag is cleared
 * instead of honoured).
 */
export function restore(currentEmail) {
  if (timer !== null) return;
  const stored = localStorage.getItem(LIVE_KEY);
  if (!stored) return;
  if (currentEmail && stored !== currentEmail) {
    localStorage.removeItem(LIVE_KEY);
    return;
  }
  beginLoop(stored);
}

/** Flip the current state; start uses the passed email when turning on. */
export function toggle(email) {
  if (isActive()) stop();
  else start(email);
}

/**
 * Subscribe to state changes so a control can mirror whether sharing is live
 * regardless of which page turned it on. Returns an unsubscriber, matching
 * subscribeToNavigation's contract.
 */
export function subscribeLiveLocation(listener) {
  listeners.add(listener);
  // Hand the new subscriber the current state immediately.
  listener(isActive());
  return () => listeners.delete(listener);
}
