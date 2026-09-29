import React, { useEffect, useState } from "react";
import {
  voiceWakeAvailable,
  voiceWakeStatus,
  voiceWakeEnable,
  voiceWakeDisable,
  voiceWakeOpenAccessibilitySettings,
  voiceWakeOpenBatterySettings,
} from "../functions/voiceWake";
import { readCaptureLog, clearCaptureLog } from "../functions/recDiagnostics";

/**
 * Step 3 of onboarding: the explainer.
 *
 * Rewritten for the weather disguise this build actually ships. The copy came
 * from the three-disguise version of the app and described a Style page, a
 * Calculator and number keys 3/7/9 - none of which exist here, so it taught
 * gestures she would never find. It now describes only what WeatherPage
 * renders: city chips, the dot colours, and the red recording state.
 *
 * The hex values below are copied from ACTION_COLORS in WeatherPage.jsx and
 * the `activeColor` passed to the recorder buttons. If those change, this
 * legend becomes a lie - keep them in step.
 *
 * Styles live in index.css under `.guide-*`.
 */

// Johannesburg -> video, Cape Town -> alert, Durban -> audio, exactly as the
// CITIES map in WeatherPage.jsx assigns them.
const COLORS = [
  {
    name: "Olive green",
    desc: "Starts recording video",
    city: "Johannesburg",
    hex: "#556b2f",
  },
  {
    name: "Pink",
    desc: "Sends your alert and location",
    city: "Cape Town",
    hex: "#ff2d75",
  },
  {
    name: "Yellow",
    desc: "Starts recording audio",
    city: "Durban",
    hex: "#eab308",
  },
];

const RED = "#ff3b30";

// Small inline kit for the voice card - the .guide-* classes in index.css
// cover the rest, and these three bits are used nowhere else.
const voiceRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  margin: "14px 0 10px",
  fontSize: "14px",
  fontWeight: 600,
};
const voiceHint = {
  fontSize: "12px",
  fontWeight: 400,
  color: "#666",
};
const voiceLinks = {
  display: "flex",
  gap: "10px",
  marginTop: "10px",
  flexWrap: "wrap",
};
const voiceLinkBtn = {
  background: "none",
  border: "1px solid #e5e5e5",
  borderRadius: "999px",
  padding: "8px 14px",
  fontSize: "13px",
  color: "#1a1a1a",
  cursor: "pointer",
  fontFamily: "inherit",
};

export default function GuidePage({ onComplete, variant = "onboarding" }) {
  // Reached two ways: as the last onboarding step (variant "onboarding") and
  // as a standalone screen from the menu (variant "settings"). The onboarding
  // copy is a one-off greeting - "Before you start" over three numbered
  // sections and a step breadcrumb. The standalone screen is a reference page
  // with its own colour legend, so it opens on that directly: no breadcrumb,
  // no greeting, and its button sends the user back rather than declaring
  // readiness.
  const isSettings = variant === "settings";

  // The built-in "help" wake word exists only inside the APK, so this card
  // renders on the settings screen of a device and nowhere else - the
  // website and the onboarding flow never see it.
  const hasVoice = isSettings && voiceWakeAvailable();
  const [voice, setVoice] = useState(null);
  const [voiceError, setVoiceError] = useState("");
  // On-device capture diagnostics (see recDiagnostics.js). Only ever shown on
  // this native settings screen; the website never renders section 05.
  const [diag, setDiag] = useState([]);
  const refreshDiag = () => setDiag(readCaptureLog());
  // Re-read the native wake state on demand (and automatically when the app
  // becomes visible again). Needed because opening the system Accessibility
  // screen only PAUSES this activity - the component stays mounted, so without
  // an explicit refresh the "Phone permission" row would keep showing the stale
  // "Off" even right after the user turns the switch on.
  const refreshVoice = async () => {
    try {
      setVoice(await voiceWakeStatus());
    } catch {
      /* status read is best-effort */
    }
  };

  useEffect(() => {
    if (!hasVoice) return;
    let alive = true;
    const load = () => {
      voiceWakeStatus().then((s) => {
        if (alive) setVoice(s);
      });
      setDiag(readCaptureLog());
    };
    load();
    // Returning from Settings/Accessibility fires visibilitychange on resume.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasVoice]);

  const handleVoiceToggle = async () => {
    setVoiceError("");
    try {
      setVoice(voice?.enabled ? await voiceWakeDisable() : await voiceWakeEnable());
    } catch (err) {
      setVoiceError(err?.message || "Could not change the setting");
      setVoice(await voiceWakeStatus());
    }
  };

  return (
    <div className="guide-page">
      {!isSettings && <span className="flow-step">Step 3 of 4</span>}
      {!isSettings && <h1 className="guide-title">Before you start</h1>}
      {!isSettings && (
        <p className="guide-subtitle">
          A short tour of how Weather behaves on this account.
        </p>
      )}

      <section className="guide-section">
        <div className="guide-section-header">
          <span className="guide-number">01</span>
          <h2 className="guide-section-title">How this Weather works</h2>
        </div>
        <p className="guide-text">
          Tap an ordinary city to load its forecast. Three cities carry a small
          coloured dot beside the name &mdash; those do more than show weather,
          and a single tap is enough to set one off. Learn what the dots mean
          before tapping one.
        </p>
      </section>

      <div className="guide-divider" />

      <section className="guide-section">
        <div className="guide-section-header">
          <span className="guide-number">02</span>
          <h2 className="guide-section-title">What the colours mean</h2>
        </div>
        <p className="guide-text">
          The colour of the dot is the whole label. Nothing is ever written on
          the button, so the screen reads the same to anyone looking over your
          shoulder.
        </p>

        <div className="guide-color-grid">
          {COLORS.map((color) => (
            <div className="guide-color-card" key={color.name}>
              <div
                className="guide-color-dot"
                style={{ background: color.hex }}
              />
              <div className="guide-color-name">{color.name}</div>
              <div className="guide-color-desc">{color.desc}</div>
              <div className="guide-color-city">{color.city}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="guide-divider" />

      <section className="guide-section">
        <div className="guide-section-header">
          <span className="guide-number">03</span>
          <h2 className="guide-section-title">When something is running</h2>
        </div>
        <p className="guide-text">
          A recording is live while its city chip is red &mdash; and only then.
          The name never changes and the rest of the forecast stays completely
          normal.
        </p>

        <div className="guide-demo">
          <div className="guide-demo-row">
            <span
              className="guide-chip"
              style={{ borderColor: "#eab308", background: "#fff", color: "#1a1a1a" }}
            >
              Durban
            </span>
            <span className="guide-demo-arrow">&rarr;</span>
            <span
              className="guide-chip"
              style={{ borderColor: RED, background: RED, color: "#fff" }}
            >
              Durban
            </span>
          </div>
          <p className="guide-note">
            Tap the same chip again to stop. What was captured is saved and
            sent to the people you have added.
          </p>
        </div>
      </section>

      <div className="guide-divider" />

      <section className="guide-section">
        <div className="guide-section-header">
          <span className="guide-number">04</span>
          <h2 className="guide-section-title">The people you trust</h2>
        </div>
        <p className="guide-text">
          Alerts go only to people you add yourself, and nothing is sent until
          you tap. Until you have added someone, an alert has nowhere to go
          &mdash; so add at least one person you would actually answer.
        </p>
      </section>

      {hasVoice && (
        <>
          <div className="guide-divider" />

          <section className="guide-section">
            <div className="guide-section-header">
              <span className="guide-number">05</span>
              <h2 className="guide-section-title">Hands-free recording</h2>
            </div>
            <p className="guide-text">
              Say &ldquo;help&rdquo; and this phone opens straight into video
              recording &mdash; even with the screen off or the app closed.
              Words are recognised on the phone itself; nothing is ever
              uploaded.
            </p>
            <p className="guide-text">
              Two switches must read On for it to work: the one below, and
              &ldquo;Weather App&rdquo; under Phone&nbsp;Settings &rarr;
              Accessibility (described there as hands-free weather). Keeping
              the phone off battery optimisation stops it from falling asleep.
            </p>

            <div style={voiceRow}>
              <span>
                Listening for &ldquo;help&rdquo;:{" "}
                {voice?.enabled ? (voice?.running ? " On" : " Starting\u2026") : " Off"}
              </span>
              <span style={voiceHint}>
                {voice?.accessibility ? "Phone permission: On" : "Phone permission: Off"}
              </span>
            </div>

            <button
              type="button"
              className="login-google flow-submit"
              onClick={handleVoiceToggle}
            >
              {voice?.enabled ? "Turn hands-free off" : "Turn hands-free on"}
            </button>

            <div style={voiceLinks}>
              <button type="button" style={voiceLinkBtn} onClick={voiceWakeOpenAccessibilitySettings}>
                Accessibility settings
              </button>
              <button type="button" style={voiceLinkBtn} onClick={voiceWakeOpenBatterySettings}>
                Battery settings
              </button>
              <button type="button" style={voiceLinkBtn} onClick={refreshVoice}>
                Refresh permission status
              </button>
            </div>

            {voiceError && (
              <p className="guide-text" style={{ color: "#dc2626" }}>
                {voiceError}
              </p>
            )}

            {/* Capture diagnostics: the real reason a recording did or didn't
                start, since the app can't show an alert without breaking the
                disguise. Reproduce a tap on the Weather page, then refresh. */}
            <div style={voiceLinks}>
              <button type="button" style={voiceLinkBtn} onClick={refreshDiag}>
                Refresh recording log
              </button>
              <button
                type="button"
                style={voiceLinkBtn}
                onClick={() => {
                  clearCaptureLog();
                  refreshDiag();
                }}
              >
                Clear log
              </button>
            </div>
            {diag.length > 0 && (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  background: "#f5f5f5",
                  color: "#333",
                  borderRadius: "8px",
                  padding: "10px",
                  margin: "8px 0 0",
                  fontFamily: "monospace"
                }}
              >
                {diag.join("\n")}
              </pre>
            )}
          </section>
        </>
      )}

      <button
        type="button"
        className="login-google flow-submit"
        onClick={onComplete}
      >
        {isSettings ? "Back to Weather" : "I’m ready"}
      </button>
    </div>
  );
}
