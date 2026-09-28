import React, { useSyncExternalStore } from "react";
import {
  isActive,
  stop,
  start,
  subscribeLiveLocation,
} from "../functions/liveLocation.js";

/**
 * The live-location toggle. It is only a view onto the sharing singleton in
 * functions/liveLocation.js: the actual timer lives there so sharing keeps
 * running when this button unmounts (navigating to the Weather page, etc).
 *
 * useSyncExternalStore is the correct hook here - the state is genuinely
 * external and can flip from any page, so the button re-renders to match
 * whatever the shared manager is doing rather than trusting its own mount.
 */
export default function LiveLocation({ width, height, email }) {
  const share = useSyncExternalStore(subscribeLiveLocation, isActive, isActive);

  const handleClick = () => {
    if (isActive()) stop();
    else start(email);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!email}
      style={{
        width,
        height,
        background: share ? "red" : "black",
        color: "white",
        border: "none",
        borderRadius: "999px",
        cursor: !email ? "not-allowed" : "pointer",
        opacity: !email ? 0.5 : 1,
      }}
    >
      {share ? "Turn off location" : "Turn on location"}
    </button>
  );
}
