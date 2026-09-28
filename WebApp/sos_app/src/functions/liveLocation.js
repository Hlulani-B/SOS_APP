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
 * start/stop, so the Weather page (or anywhere else) keeps sharing exactly
 * as long as the tab stays open.
 *
 * Deliberate scope: a full page reload clears it. Persisting "sharing" across
 * a reload would quietly resume broadcasting coordinates the user can no
 * longer see the red button for, so we let the visible control be the source
 * of truth instead.
 */

const INTERVAL_MS = 10000;

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

/**
 * Begin sharing this email's position every INTERVAL_MS.
 * Fires one ShareLocation immediately so the map reflects you right away
 * rather than after the first idle 10s tick. No-op if already sharing.
 */
export function start(email) {
  if (timer !== null) return;
  if (!email) {
    console.error("liveLocation.start: no email to share for");
    return;
  }
  activeEmail = email;
  ShareLocation(email).catch((err) => console.error(err));
  timer = setInterval(() => {
    ShareLocation(activeEmail).catch((err) => console.error(err));
  }, INTERVAL_MS);
  emit();
}

/** Stop sharing and clear the stored coordinates. No-op if not sharing. */
export function stop() {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
  const email = activeEmail;
  activeEmail = null;
  StopLiveLocation(email).catch((err) => console.error(err));
  emit();
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
