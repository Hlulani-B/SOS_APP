import React from "react";
import AddPalForm from "./AddPalForm.jsx";

/**
 * Step 4 of onboarding: invite the people who should be able to see you.
 *
 * Entirely optional - "Add later" leaves the app with zero pals and changes
 * nothing else. The copy deliberately points at the Location page as the
 * permanent home for this action, because that is where both header buttons
 * (add a pal, and the invitations inbox) live after onboarding.
 *
 * Inviting only queues the request: the pair links up when the other side
 * accepts from their own invitations panel, so nobody appears on a map
 * without having agreed to be seen.
 */
export default function AddPalsPage({ email, onComplete }) {
  return (
    <div className="flow-page">
      <span className="flow-step">Step 4 of 4</span>
      <h1 className="flow-title">Add the people you trust</h1>
      <p className="flow-lede">
        Enter their email addresses and we'll send an invite. They'll appear on
        your map once they accept - and you on theirs.
      </p>

      <AddPalForm email={email} />

      <p className="flow-lede pal-page-note">
        No one to add right now? You can add email addresses any time from the
        Location page.
      </p>

      <button type="button" className="login-google flow-submit" onClick={onComplete}>
        Continue
      </button>
      <button type="button" className="pal-skip" onClick={onComplete}>
        Add later
      </button>
    </div>
  );
}
