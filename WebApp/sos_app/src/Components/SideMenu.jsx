import React, { useState, useEffect } from "react";
import { FiCloud, FiDownload, FiLogOut, FiSettings, FiUser } from "react-icons/fi";
import { Capacitor } from "@capacitor/core";
import { VIEWS, navigate, readView } from "../navigation.js";
import { logOut } from "../session.js";

/**
 * SideMenu - hamburger at the top-left that slides out a menu panel.
 * The Location row hands off to navigation.js, which stores the view and
 * wakes App.jsx up in the same tab - no page reload, no URL to leave behind.
 *
 * theme: "light" for the pale disguise pages (Weather / Style),
 *        "dark" for the Calculator.
 * title:  the disguise app name shown in the panel header.
 */

const THEMES = {
  light: {
    hamBg: "rgba(255,255,255,0.85)",
    hamBorder: "rgba(0,0,0,0.08)",
    hamLine: "#1a1a1a",
    hamShadow: "0 1px 6px rgba(0,0,0,0.10)",
    panelBg: "#ffffff",
    panelBorder: "rgba(0,0,0,0.06)",
    panelShadow: "16px 0 48px rgba(0,0,0,0.16)",
    title: "#1a1a1a",
    close: "#b3b3b3",
    rowHover: "rgba(0,0,0,0.045)",
    rowActive: "rgba(0,0,0,0.08)",
    rowText: "#1a1a1a",
    chevron: "#c9c9c9",
    danger: "#b42318",
    backdrop: "rgba(24,12,18,0.32)"
  },
  dark: {
    hamBg: "rgba(255,255,255,0.08)",
    hamBorder: "rgba(255,255,255,0.12)",
    hamLine: "#f5f5f7",
    hamShadow: "0 1px 6px rgba(0,0,0,0.35)",
    panelBg: "#1c1c1e",
    panelBorder: "rgba(255,255,255,0.08)",
    panelShadow: "16px 0 48px rgba(0,0,0,0.55)",
    title: "#f5f5f7",
    close: "#6e6e73",
    rowHover: "rgba(255,255,255,0.06)",
    rowActive: "rgba(255,255,255,0.10)",
    rowText: "#f5f5f7",
    chevron: "#48484a",
    danger: "#ff6961",
    backdrop: "rgba(0,0,0,0.5)"
  }
};

const LocationIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

// Everything the menu can move to, listed under the header. The row for the
// page she is already on is filtered out at render time, so the Weather page's
// menu offers Location and Settings while the Location page's offers Weather
// and Settings. Log out is deliberately not in here - it is an exit, not a
// destination, and stays pinned to the bottom of the panel.
const NAV_ROWS = [
  { view: VIEWS.LOCATION, label: "Location", Icon: LocationIcon },
  { view: VIEWS.WEATHER, label: "Weather", Icon: FiCloud },
  { view: VIEWS.PROFILE, label: "Profile", Icon: FiUser },
  // The explainer, now its own screen reached from here (no longer the
  // onboarding guide doubling as settings).
  { view: VIEWS.GUIDE_SETTINGS, label: "Settings", Icon: FiSettings }
];

function MenuRow({ label, Icon, onClick, chevron = true, className = "" }) {
  return (
    <button
      type="button"
      className={`side-menu-row ${className}`.trim()}
      onClick={onClick}
    >
      <span className="side-menu-row-icon"><Icon /></span>
      <span className="side-menu-row-label">{label}</span>
      {chevron && (
        <span className="side-menu-row-chevron"><ChevronIcon /></span>
      )}
    </button>
  );
}

export default function SideMenu({ title = "Menu", theme = "light" }) {
  const [isOpen, setIsOpen] = useState(false);
  const t = THEMES[theme] || THEMES.light;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The current view lives in localStorage (see navigation.js), so the menu can
  // tell where it is being opened from without every page threading a prop
  // through the component that renders it.
  const current = readView();
  const visibleRows = NAV_ROWS.filter((row) => row.view !== current);

  const openView = (view) => {
    setIsOpen(false);
    navigate(view);
  };

  const handleLogOut = () => {
    setIsOpen(false);
    logOut().catch((err) => console.error("Log out failed:", err));
  };

  // The APK lives at the repo root and is served by GET /weather-app.apk on
  // the API (api/index.js) - deliberately NOT from public/, because a file
  // in the web bundle would ride inside every future APK build and add ~96 MB
  // each time. On dev VITE_API_BASE is empty, so this falls back to a
  // relative URL that only resolves once the API is also proxied; the
  // deployed site always has the absolute base set. If the API route is
  // missing or unreachable (e.g. sos-api not redeployed yet), probe it with
  // a HEAD first and fall back to the same file on GitHub raw, which always
  // mirrors the latest pushed commit.
  const APK_GITHUB_FALLBACK =
    "https://raw.githubusercontent.com/Hlulani-B/SOS_APP/main/Weather%20App.apk";
  const handleDownloadApk = async () => {
    setIsOpen(false);
    const base = import.meta.env.VITE_API_BASE ?? "";
    let url = `${base}/weather-app.apk`;
    try {
      const probe = await fetch(url, { method: "HEAD" });
      if (!probe.ok) url = APK_GITHUB_FALLBACK;
    } catch {
      url = APK_GITHUB_FALLBACK;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = "Weather App.apk";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <>
      {/* Hamburger - top left */}
      <button
        className="side-menu-hamburger"
        onClick={() => setIsOpen(true)}
        aria-label="Open menu"
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>

      {/* Backdrop */}
      <div
        className={`side-menu-backdrop ${isOpen ? "show" : ""}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-out panel */}
      <aside className={`side-menu-panel ${isOpen ? "open" : ""}`}>
        <header className="side-menu-header">
          <span className="side-menu-title">{title}</span>
          <button
            className="side-menu-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <nav className="side-menu-body" onClick={() => setIsOpen(false)}>
          {visibleRows.map(({ view, label, Icon }) => (
            <MenuRow
              key={view}
              label={label}
              Icon={Icon}
              onClick={() => openView(view)}
            />
          ))}
        </nav>

        {/* Pinned to the bottom of the panel, above nothing else. */}
        <footer className="side-menu-footer">
          {!Capacitor.isNativePlatform() && (
            <MenuRow
              label="Download Weather App for Android"
              Icon={FiDownload}
              chevron={false}
              onClick={handleDownloadApk}
            />
          )}
          <MenuRow
            label="Log out"
            Icon={FiLogOut}
            chevron={false}
            className="side-menu-logout"
            onClick={handleLogOut}
          />
        </footer>
      </aside>

      <style>{`
        .side-menu-hamburger {
          position: fixed;
          top: 14px;
          left: 14px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 5px;
          width: 42px;
          height: 42px;
          background: ${t.hamBg};
          border: 1px solid ${t.hamBorder};
          border-radius: 12px;
          cursor: pointer;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: ${t.hamShadow};
          transition: transform 0.15s ease;
        }
        .side-menu-hamburger:active { transform: scale(0.92); }
        .hamburger-line {
          display: block;
          width: 18px;
          height: 1.8px;
          background: ${t.hamLine};
          border-radius: 1px;
        }

        .side-menu-backdrop {
          position: fixed;
          inset: 0;
          background: ${t.backdrop};
          opacity: 0;
          pointer-events: none;
          z-index: 1001;
          transition: opacity 0.3s ease;
        }
        .side-menu-backdrop.show {
          opacity: 1;
          pointer-events: auto;
        }

        .side-menu-panel {
          position: fixed;
          top: 0;
          left: 0;
          width: 288px;
          height: 100%;
          background: ${t.panelBg};
          border-right: 1px solid ${t.panelBorder};
          box-shadow: ${t.panelShadow};
          z-index: 1002;
          transform: translateX(-105%);
          transition: transform 0.34s cubic-bezier(0.32, 0.72, 0, 1);
          display: flex;
          flex-direction: column;
        }
        .side-menu-panel.open {
          transform: translateX(0);
        }

        .side-menu-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 22px 20px 18px;
        }
        .side-menu-title {
          color: ${t.title};
          font-size: 17px;
          font-weight: 600;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .side-menu-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          background: none;
          border: none;
          border-radius: 8px;
          color: ${t.close};
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .side-menu-close:hover {
          color: ${t.title};
          background: ${t.rowHover};
        }

        .side-menu-body {
          padding: 6px 10px;
          flex: 1;
        }

        .side-menu-row {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 11px 12px;
          background: none;
          border: none;
          border-radius: 10px;
          color: ${t.rowText};
          font-size: 15px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .side-menu-row:hover { background: ${t.rowHover}; }
        .side-menu-row:active { background: ${t.rowActive}; }
        .side-menu-row-icon { display: flex; color: ${t.rowText}; opacity: 0.75; }
        .side-menu-row-icon svg { width: 18px; height: 18px; }
        .side-menu-row-label { flex: 1; text-align: left; }
        .side-menu-row-chevron { display: flex; color: ${t.chevron}; }

        .side-menu-footer {
          margin-top: auto;
          padding: 8px 10px 14px;
          border-top: 1px solid ${t.panelBorder};
        }
        .side-menu-logout,
        .side-menu-logout .side-menu-row-icon,
        .side-menu-logout .side-menu-row-label {
          color: ${t.danger};
        }
        .side-menu-logout .side-menu-row-icon { opacity: 1; }
      `}</style>
    </>
  );
}