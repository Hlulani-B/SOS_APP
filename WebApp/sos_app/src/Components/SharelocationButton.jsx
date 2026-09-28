import React, { useState, useEffect } from "react";
import { ShareLocation, StopLiveLocation } from "../functions/apiLocation.js";

export default function LiveLocation({ width, height, email }) {
  const [share, setShare] = useState(false);

  useEffect(() => {
    if (!share) return;

    const id = setInterval(() => {
      ShareLocation(email).catch((err) => console.error(err));
    }, 10000);

    return () => clearInterval(id);
  }, [share, email]);

  const handleClick = () => {
    if (share) {
      setShare(false);
      StopLiveLocation(email).catch((err) => console.error(err));
    } else {
      setShare(true);
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        width,
        height,
        background: share ? "red" : "black",
        color: "white",
        border: "none",
        borderRadius: "999px",
        cursor: "pointer"
      }}
    >
      {share ? "Turn off location" : "Turn on location"}
    </button>
  );
}