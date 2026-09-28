/**
 * toE164 - normalizes phone numbers to E.164 format, which Twilio requires.
 * Defaults to the South African country code (+27) since local numbers are
 * typically entered 0-prefixed, e.g. "0694015715" -> "+27694015715".
 *
 * Handles:
 *   "0694015715"     -> "+27694015715"  (local SA mobile)
 *   "27694015715"    -> "+27694015715"  (SA without the +)
 *   "694015715"      -> "+27694015715"  (0 already dropped)
 *   "+27694015715"   -> unchanged
 *   "069 401 5715"   -> "+27694015715"  (spacing stripped)
 */
export function toE164(raw) {
  if (!raw) return "";

  // Strip spaces, dashes, dots and parentheses
  let num = String(raw).trim().replace(/[\s\-().]/g, "");

  // Already international - trust it as-is
  if (num.startsWith("+")) return num;

  // Keep digits only from here
  num = num.replace(/\D/g, "");

  if (num.startsWith("0")) return "+27" + num.slice(1); // 069... -> +2769...
  if (num.startsWith("27")) return "+" + num;           // 2769... -> +2769...
  if (num.length === 9) return "+27" + num;             // 694... (no leading 0)

  // Anything else: treat the digits as an international number
  return num ? "+" + num : "";
}

/**
 * explainTwilioError - converts a raw Twilio error body (from response.text())
 * into a human-readable hint. The most common failure when testing is Twilio
 * trial accounts refusing to deliver to unverified numbers, which no code
 * change can bypass - it has to be fixed in the Twilio console.
 */
export function explainTwilioError(raw) {
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return raw;
  }

  // Trial account: the destination number is not a verified recipient
  if (parsed.code === 572002 || /verified recipient/i.test(parsed.message || "")) {
    return `${parsed.message} -> FIX: Twilio trial accounts only deliver to verified numbers. Open console.twilio.com > Phone Numbers > Verified Caller IDs, add the "To" number, complete the verification, then retry.`;
  }

  // Invalid destination number format
  if (parsed.code === 21211) {
    return `${parsed.message} -> FIX: check the contact's number format (E.164, e.g. +27694015715).`;
  }

  // Trial "limited parameter access" and other trial-only restrictions
  if (/trial account/i.test(parsed.message || "")) {
    return `${parsed.message} -> FIX: this is a Twilio trial restriction. Verify the "To" number (Phone Numbers > Verified Caller IDs) or upgrade the Twilio account.`;
  }

  return parsed.message || raw;
}
