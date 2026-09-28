import React, { useState } from "react";
import { send_invite } from "../functions/apiPals.js";

/**
 * Shared "add a pal by email" form.
 *
 * Used by the onboarding AddPals step and by the Location page's add-pal
 * panel, so the invite call and its error wording live in exactly one place.
 *
 * send_invite needs a users row for the invitee (the invite table has FKs on
 * both ends), so a never-signed-up address comes back as a foreign-key error
 * from Postgres - that case is translated into plain language here rather
 * than surfacing raw SQL. A duplicate invite is likewise reworded from the
 * backend's "has already invited" throw.
 */
export default function AddPalForm({ email, onAdded }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok" | "err", text }
  const [sent, setSent] = useState([]);

  async function handleSubmit(event) {
    event.preventDefault();
    const invitee = value.trim().toLowerCase();
    if (!invitee || busy) return;

    if (invitee === String(email).toLowerCase()) {
      setMessage({ kind: "err", text: "That's your own email address." });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await send_invite(email, invitee);
      setSent((prev) => (prev.includes(invitee) ? prev : [...prev, invitee]));
      setValue("");
      setMessage({ kind: "ok", text: `Invitation sent to ${invitee}.` });
      if (onAdded) onAdded(invitee);
    } catch (err) {
      const raw = err.message || "Could not send the invitation.";
      // The API now answers "not registered" with ready-to-show wording sent
      // from send_invite itself; older builds threw raw Postgres foreign-key
      // text. Both shapes are mapped here so the copy stays kind on either.
      let text = raw.replace(/^send_invite:\s*/, "");
      if (/fkey|foreign key|hasn't set up|doesn't have an account/i.test(raw)) {
        text = `${invitee} hasn't set up an account yet — ask them to sign in first.`;
      } else if (/already invited/i.test(raw)) {
        text = `You've already invited ${invitee}.`;
      }
      setMessage({ kind: "err", text: text || "Could not send the invitation." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pal-form">
      <form className="pal-form-row" onSubmit={handleSubmit}>
        <input
          className="flow-input pal-form-input"
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="friend@example.com"
          autoComplete="off"
          aria-label="Email address to invite"
        />
        <button type="submit" className="pal-form-add" disabled={busy || !value.trim()}>
          {busy ? "Sending..." : "Add"}
        </button>
      </form>

      {message && (
        <div className={`pal-form-msg ${message.kind === "ok" ? "ok" : "err"}`}>
          {message.text}
        </div>
      )}

      {sent.length > 0 && (
        <ul className="pal-form-sent" aria-label="Invitations sent">
          {sent.map((addr) => (
            <li key={addr}>{addr}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
