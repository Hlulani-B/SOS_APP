import React, { useState, useRef } from "react";
import { SOSsend } from "./sosHelper"; // Imported helper function
import { requestOwnership, releaseOwnership, isActiveOwner } from "./recordingManager";

const OWNERSHIP_ID = "sos";

export function SOSButton({
  width,
  height,
  text = "Record",
  idleColor = "#ff2d75",
  idleTextColor = "#ffffff",
  activeColor = "#cc0052",
  activeTextColor = "#ffffff",
  style = {},
  onPress,
  children
}) {
  const [isDispatched, setIsDispatched] = useState(false);
  const finishRef = useRef({ promise: Promise.resolve(), resolve: null });
  const busyRef = useRef(false);

  // Resolves once the in-flight dispatch has fully completed - this is
  // what other components await before taking over.
  const stopAndFinish = () => finishRef.current.promise;

  const handleClick = () => {
    if (onPress) onPress();
    if (busyRef.current) return; // a dispatch is already in flight

    busyRef.current = true;

    (async () => {
      // Claim the single action lock. Any active recording is stopped and
      // we wait until it has completely finished its job (stop -> download
      // -> send) before this alert goes out.
      await requestOwnership(OWNERSHIP_ID, stopAndFinish);

      if (!isActiveOwner(OWNERSHIP_ID)) {
        busyRef.current = false;
        return;
      }

      // The promise handed to whoever stops us next
      finishRef.current.promise = new Promise((resolve) => {
        finishRef.current.resolve = resolve;
      });

      try {
        // Calls the helper which grabs location and sends to all contacts
        // stored by the user; resolves when every message has been sent.
        await new Promise((resolve) => {
          SOSsend([], (msg) => resolve(msg));
        });
      } catch (error) {
        console.error("Error dispatching alert:", error);
      } finally {
        // Job fully finished - hand the lock to the next action
        if (finishRef.current.resolve) finishRef.current.resolve();
        releaseOwnership(OWNERSHIP_ID);
        busyRef.current = false;
      }

      setIsDispatched(true);
      setTimeout(() => setIsDispatched(false), 2000);
    })();
  };

  return (
    <button
      onClick={handleClick}
      style={{
        width: width,
        height: height,
        backgroundColor: isDispatched ? activeColor : idleColor,
        color: isDispatched ? activeTextColor : idleTextColor,
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: "bold",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background-color 0.2s ease",
        ...style
      }}
    >
      {/* Label never changes - only the color turns red once the alert
          has gone out, so the disguise holds even while being watched */}
      {children || text}
    </button>
  );
}
