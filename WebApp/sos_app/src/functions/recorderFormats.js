/**
 * recorderFormats - picks the MediaRecorder mimeType that keeps emailed
 * recordings openable. MP4/M4A is tried first because mail apps (Gmail,
 * iPhone Mail, Outlook) open it natively; webm is the fallback because
 * most mail apps have no webm player at all - a valid webm attachment
 * downloads but then "fails to open". Chrome (126+) and iOS Safari record
 * mp4; older browsers fall back to webm. Returns "" when nothing in the
 * list is supported, in which case MediaRecorder uses its own default.
 */
export function pickRecorderMime(candidates) {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}
