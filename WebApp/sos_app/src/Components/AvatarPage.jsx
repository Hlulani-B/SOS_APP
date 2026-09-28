import React, { useState } from "react";
import { AVATARS, AvatarImage, avatarLabel } from "./avatars.jsx";
import { setAvatar } from "../functions/apiUsers.js";

/**
 * Step 2 of onboarding: pick one of the fifteen avatars.
 *
 * Only the short id is persisted to users.avatar - never the hosted URL - so
 * the set can later be re-pointed at bundled local files for the Capacitor
 * build without migrating anyone's row.
 */
export default function AvatarPage({ email, preset, onComplete }) {
  const [picked, setPicked] = useState(
    AVATARS.some((a) => a.id === preset) ? preset : AVATARS[0].id
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    setBusy(true);
    setError("");
    try {
      await setAvatar(email, picked);
      onComplete(picked);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="flow-page">
      <span className="flow-step">Step 2 of 3</span>
      <h1 className="flow-title">Pick a picture</h1>
      <p className="flow-lede">
        This shows up next to your name so the people you add can recognise
        you at a glance.
      </p>

      <div className="flow-grid">
        {AVATARS.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            className="flow-tile"
            aria-pressed={picked === avatar.id}
            aria-label={avatar.label}
            onClick={() => setPicked(avatar.id)}
          >
            <AvatarImage id={avatar.id} size="100%" />
          </button>
        ))}
      </div>

      <p className="flow-selected">{avatarLabel(picked)} selected</p>

      {error && <div className="login-error">{error}</div>}

      <button
        type="button"
        className="login-google flow-submit"
        onClick={handleContinue}
        disabled={busy}
      >
        {busy ? "Saving..." : "Continue"}
      </button>
    </div>
  );
}
