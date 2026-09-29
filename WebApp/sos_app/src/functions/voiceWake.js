/**
 * JS wrapper for the native VoiceWake plugin - the built-in "help" wake word.
 *
 * On the website every call resolves to a disabled no-op: the wake engine
 * only exists inside the APK, and nothing here may break the browser bundle
 * (the plugin is registered natively in MainActivity, not via npm).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

const IS_NATIVE = Capacitor.isNativePlatform();

const NOOP_STATUS = {
  enabled: false,
  running: false,
  microphone: false,
  accessibility: false,
};

// Only touch registerPlugin on a device - on web the proxy would reject on
// every method call, and the noise would hide real errors.
const VoiceWakeNative = IS_NATIVE ? registerPlugin("VoiceWake") : null;

export function voiceWakeAvailable() {
  return IS_NATIVE;
}

export async function voiceWakeStatus() {
  if (!VoiceWakeNative) return { ...NOOP_STATUS };
  try {
    return await VoiceWakeNative.status();
  } catch (err) {
    console.error("VoiceWake status failed:", err);
    return { ...NOOP_STATUS };
  }
}

/** Resolves with the fresh status; rejects if the mic permission was denied
 *  or the service could not start, so the UI can show why. */
export async function voiceWakeEnable() {
  if (!VoiceWakeNative) return { ...NOOP_STATUS };
  return VoiceWakeNative.enable();
}

export async function voiceWakeDisable() {
  if (!VoiceWakeNative) return { ...NOOP_STATUS };
  try {
    return await VoiceWakeNative.disable();
  } catch (err) {
    console.error("VoiceWake disable failed:", err);
    return { ...NOOP_STATUS };
  }
}

export async function voiceWakeOpenAccessibilitySettings() {
  if (!VoiceWakeNative) return;
  try {
    await VoiceWakeNative.openAccessibilitySettings();
  } catch (err) {
    console.error("Could not open accessibility settings:", err);
  }
}

export async function voiceWakeOpenBatterySettings() {
  if (!VoiceWakeNative) return;
  try {
    await VoiceWakeNative.openBatterySettings();
  } catch (err) {
    console.error("Could not open battery settings:", err);
  }
}

/**
 * One-shot read of what the wake word asked for: returns "video" at most
 * once per wake, "none" otherwise (and always "none" on web).
 */
export async function consumeWakeAction() {
  if (!VoiceWakeNative) return "none";
  try {
    const res = await VoiceWakeNative.consumePending();
    return res?.action || "none";
  } catch (err) {
    console.error("VoiceWake consumePending failed:", err);
    return "none";
  }
}
