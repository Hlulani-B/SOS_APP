/**
 * recDiagnostics - a covert, disguise-safe error recorder for the on-device
 * capture pipeline (audio + video).
 *
 * The safety components deliberately never show an alert() when getUserMedia
 * fails (a popup would break the weather disguise in front of an onlooker),
 * so on a phone the real reason a recording won't start is invisible - it only
 * reaches console.error, which nobody can read without a USB/ADB connection.
 *
 * This stashes the last few capture attempts (and their exact error) in
 * localStorage so the native Settings screen (Guide section 05) can surface
 * them. It is passive: writing a couple of short strings has no effect on the
 * website or on any recording, and nothing here is ever uploaded.
 */

const KEY = "sos_rec_diag";

function stamp() {
  try {
    return new Date().toLocaleTimeString();
  } catch {
    return "";
  }
}

/** Append one diagnostic line, keeping only the most recent 10. */
export function logCapture(msg) {
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) || "[]");
    prev.push(`${stamp()} ${msg}`);
    localStorage.setItem(KEY, JSON.stringify(prev.slice(-10)));
  } catch {
    // Storage may be unavailable (private mode); diagnostics are best-effort.
  }
}

/** Read the recorded lines, newest last. */
export function readCaptureLog() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function clearCaptureLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Snapshot the capture environment at the moment of a tap, so we can tell an
 * insecure-context failure (navigator.mediaDevices undefined) apart from a
 * permission denial (mediaDevices present, getUserMedia rejects).
 */
export function describeCaptureEnv() {
  const hasMD = typeof navigator !== "undefined" && !!navigator.mediaDevices;
  const hasGUM = hasMD && typeof navigator.mediaDevices.getUserMedia === "function";
  const secure =
    typeof window !== "undefined" && window.isSecureContext ? "secure" : "INSECURE";
  return `mediaDevices=${hasMD ? "y" : "n"} getUserMedia=${hasGUM ? "y" : "n"} ctx=${secure} origin=${
    typeof location !== "undefined" ? location.origin : "?"
  }`;
}
