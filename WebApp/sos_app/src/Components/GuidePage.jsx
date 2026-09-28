import React from "react";

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

export default function GuidePage({ onComplete, variant = "onboarding" }) {
  // Reached two ways: as the last onboarding step (variant "onboarding") and
  // as a standalone screen from the menu (variant "settings"). The onboarding
  // copy is a one-off greeting - "Before you start" over three numbered
  // sections and a step breadcrumb. The standalone screen is a reference page
  // with its own colour legend, so it opens on that directly: no breadcrumb,
  // no greeting, and its button sends the user back rather than declaring
  // readiness.
  const isSettings = variant === "settings";
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
