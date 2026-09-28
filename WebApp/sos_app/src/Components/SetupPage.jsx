import React, { useState } from "react";
import { Checkuser, addUser, setName, setSurname } from "../functions/apiUsers.js";

/**
 * Step 1 of onboarding: collect a first name and surname.
 *
 * The users row is created here rather than at login, because this is the
 * first point in the flow where there is actually a name worth storing -
 * Firebase only guarantees an email.
 *
 * If the row already exists (she closed the tab between steps and came back)
 * the fields are updated instead of inserted, so re-running setup never trips
 * the email primary key.
 *
 * Copy stays deliberately ordinary: this screen sits behind a "Weather App"
 * sign-in, so it must not explain what the name is ultimately used for. The
 * Guide step that follows is where the app tells the truth about itself.
 */
export default function SetupPage({ email, preset, onComplete }) {
  const [name, setNameField] = useState(preset?.name || "");
  const [surname, setSurnameField] = useState(preset?.surname || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const first = name.trim();
    const last = surname.trim();

    if (!first || !last) {
      setError("Please fill in both names.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      if (await Checkuser(email)) {
        await setName(email, first);
        await setSurname(email, last);
      } else {
        await addUser(email, first, last);
      }
      onComplete({ name: first, surname: last });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="flow-page" onSubmit={handleSubmit}>
      <span className="flow-step">Step 1 of 4</span>
      <h1 className="flow-title">Tell us who you are</h1>
      <p className="flow-lede">
        This is the name that appears on your profile and beside anything you
        save.
      </p>

      <div className="flow-form">
        <div className="flow-field">
          <label className="flow-label" htmlFor="setup-name">
            First name
          </label>
          <input
            id="setup-name"
            className="flow-input"
            type="text"
            value={name}
            onChange={(e) => setNameField(e.target.value)}
            placeholder="Hlulani"
            autoComplete="given-name"
          />
        </div>

        <div className="flow-field">
          <label className="flow-label" htmlFor="setup-surname">
            Surname
          </label>
          <input
            id="setup-surname"
            className="flow-input"
            type="text"
            value={surname}
            onChange={(e) => setSurnameField(e.target.value)}
            placeholder="Baloyi"
            autoComplete="family-name"
          />
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button
        type="submit"
        className="login-google flow-submit"
        disabled={busy}
      >
        {busy ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
