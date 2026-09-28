import React from "react";

/**
 * Fifteen cartoon avatars, served from two free image hosts:
 *
 *   - DiceBear   (api.dicebear.com)  - cartoon people, deterministic by seed
 *   - OpenMoji   (openmoji.org)      - flat cartoon animals + characters
 *
 * Both are keyless and free to hot-link; every URL here was checked live and
 * returns 200 with Content-Type image/svg+xml.
 *
 * What gets persisted to users.avatar is the short `id` below, never the URL.
 * That keeps the column tiny and lets the set be re-pointed at another host
 * (or at bundled local files for the Capacitor build) without touching rows.
 *
 * Tradeoff worth remembering: the picker now needs the network, and opening
 * it makes requests to third-party hosts - which is at odds with the README's
 * "nothing leaves the device" stance. If that matters later, the fix is to
 * download these 15 SVGs into src/assets/avatars and swap `src` to an import.
 */

const DICEBEAR = (style, seed) =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;

const OPENMOJI = (codepoint) =>
  `https://openmoji.org/data/color/svg/${codepoint}.svg`;

export const AVATARS = [
  // people
  { id: "amara", label: "Amara", bg: "#ffeef2", src: DICEBEAR("adventurer", "Amara") },
  { id: "thabo", label: "Thabo", bg: "#e8f2ff", src: DICEBEAR("micah", "Thabo") },
  { id: "lerato", label: "Lerato", bg: "#f2f0ff", src: DICEBEAR("big-smile", "Lerato") },

  // animals
  { id: "panda", label: "Panda", bg: "#eef1f5", src: OPENMOJI("1F43C") },
  { id: "fox", label: "Fox", bg: "#fdeee0", src: OPENMOJI("1F98A") },
  { id: "owl", label: "Owl", bg: "#efe6f7", src: OPENMOJI("1F989") },
  { id: "unicorn", label: "Unicorn", bg: "#fbe7f3", src: OPENMOJI("1F984") },
  { id: "tiger", label: "Tiger", bg: "#fff4d6", src: OPENMOJI("1F42F") },
  { id: "penguin", label: "Penguin", bg: "#e4f1fb", src: OPENMOJI("1F427") },
  { id: "frog", label: "Frog", bg: "#e3f6e8", src: OPENMOJI("1F438") },
  { id: "bunny", label: "Bunny", bg: "#f7eef5", src: OPENMOJI("1F430") },
  { id: "lion", label: "Lion", bg: "#fdf0dc", src: OPENMOJI("1F981") },

  // characters
  { id: "robot", label: "Robot", bg: "#eef3f7", src: OPENMOJI("1F916") },
  { id: "alien", label: "Alien", bg: "#e6f7ef", src: OPENMOJI("1F47D") },
  { id: "ghost", label: "Ghost", bg: "#f0f0f7", src: OPENMOJI("1F47B") },
];

/** URL for a stored avatar id; unknown or empty ids fall back to the first. */
export function avatarSrc(id) {
  return (AVATARS.find((a) => a.id === id) ?? AVATARS[0]).src;
}

/** Display label for a stored avatar id, for alt text and menus. */
export function avatarLabel(id) {
  return (AVATARS.find((a) => a.id === id) ?? AVATARS[0]).label;
}

/**
 * One avatar as a round tinted tile. `size` takes a number (pixels) or any
 * CSS length string such as "100%", so the same component serves the picker
 * and the profile chip. `loading="lazy"` keeps the picker from firing all
 * fifteen requests before they scroll into view.
 */
export function AvatarImage({ id, size = 64, className }) {
  const avatar = AVATARS.find((a) => a.id === id) ?? AVATARS[0];
  const numeric = typeof size === "number";
  const box = numeric ? `${size}px` : size;
  const inner = numeric ? Math.round(size * 0.82) : "82%";
  return (
    <span
      className={className}
      style={{
        width: box,
        height: box,
        borderRadius: "50%",
        background: avatar.bg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        src={avatar.src}
        alt={avatar.label}
        loading="lazy"
        draggable={false}
        style={{
          width: inner,
          height: inner,
          objectFit: "contain",
          display: "block",
        }}
      />
    </span>
  );
}
