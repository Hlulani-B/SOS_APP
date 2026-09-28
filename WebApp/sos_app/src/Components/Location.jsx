import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiBell, FiUserPlus } from "react-icons/fi";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import SideMenu from "./SideMenu.jsx";
import SharelocationButton from "./SharelocationButton.jsx";
import { AvatarImage, avatarSrc } from "./avatars.jsx";
import { get_pals } from "../functions/apiPals.js";
import { getProfiles } from "../functions/apiUsers.js";
import { getLocationsByEmails } from "../functions/apiLocation.js";
import { getLocationAndWeather } from "../functions/getLocationWeather.js";
import { VIEWS, navigate } from "../navigation.js";

/**
 * Location - the screen behind the menu's "Location" row.
 *
 * Header, left to right: the hamburger (SideMenu renders it as a fixed
 * control, so this bar just reserves space for it), the "Weather" wordmark,
 * then the two actions. The wordmark doubles as the way back to the forecast,
 * because the side menu only carries a single row and it points here.
 *
 * The body is a leaflet map of every pal who is live-sharing: get_pals
 * supplies the emails, getProfiles the names + avatars and
 * getLocationsByEmails the coordinates. Markers carry the pal's avatar;
 * below the map a card per pal shows online/offline state, and for the
 * online ones the street / town / province plus the current weather there
 * (getLocationAndWeather, prefetched once per sharing pal on load and
 * shared with the marker popups).
 *
 * Styling follows WeatherPage rather than index.css - inline style objects for
 * the defaults, a class-scoped <style> block for the hover and responsive
 * rules, which inline styles cannot express.
 */

const MAP_FALLBACK_CENTER = [-28.5, 24.0]; // heart of South Africa, seen before pals land

// South Africa with a little sea room, as [[south, west], [north, east]].
const SA_BOUNDS = [[-36.0, 15.5], [-21.0, 33.5]];

// Avatar rendered as a round map pin. divIcon takes raw HTML, and the only
// interpolated values are ids resolved by avatarSrc - never user text.
// className must stay a real class: an empty string makes Leaflet's marker
// code choke on svg.className.baseVal in the console.
function makeAvatarIcon(id) {
  return L.divIcon({
    className: "loc-avatar-pin",
    html: `<img src="${avatarSrc(id)}" alt="" draggable="false" />`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -26]
  });
}

// Re-frames the map whenever the plotted pals change; MapContainer's
// initial center is rendered before the async data has arrived.
function FitToPals({ markers }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 1) {
      // Street-name depth straight away for a lone pal.
      map.setView([markers[0].lat, markers[0].lon], 16);
    } else if (markers.length > 1) {
      const pts = markers.map((m) => [m.lat, m.lon]);
      // maxZoom keeps a tight cluster (all in one city) zoomed in to street
      // level instead of pulling back to a whole-province view.
      map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 16 });
    }
  }, [map, markers]);
  return null;
}

// The map mounts inside a wrapper whose height the stylesheet settles a
// beat later; without this nudge Leaflet can measure zero and park the
// view at zoom 0 with every marker stacked.
function InvalidateSizeOnLoad() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export default function Location({ email }) {
  const [pals, setPals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // email -> { loading, data, error } for the click-to-fetch weather popups
  const [weatherByPal, setWeatherByPal] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadPals() {
      setLoading(true);
      setError(null);
      try {
        const emails = await get_pals(email);

        // Every pal lands in the list; the ones with no coordinates row
        // (or a NULL one - sharing never started or was stopped) simply
        // show as offline instead of vanishing.
        const [profiles, locations] = await Promise.all([
          getProfiles(emails),
          getLocationsByEmails(emails)
        ]);

        const locationByEmail = new Map(locations.map((l) => [l.email, l]));

        if (!cancelled) {
          setPals(
            profiles.map((profile) => ({
              email: profile.email,
              name: profile.name,
              surname: profile.surname,
              avatar: profile.avatar,
              lat: locationByEmail.get(profile.email) ? Number(locationByEmail.get(profile.email).latitude) : null,
              lon: locationByEmail.get(profile.email) ? Number(locationByEmail.get(profile.email).longitude) : null
            }))
          );
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load pals");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPals();
    return () => { cancelled = true; };
  }, [email]);

  const onlinePals = useMemo(() => pals.filter((p) => p.lat != null && p.lon != null), [pals]);

  const markers = useMemo(
    () => onlinePals.map((pal) => ({ ...pal, icon: makeAvatarIcon(pal.avatar) })),
    [onlinePals]
  );

  // Emails already kicked off, kept in a ref so the guard survives the
  // double effect-run under StrictMode (a state-updater side effect here
  // would fire two fetches per pal in dev).
  const requestedRef = useRef(new Set());

  const loadWeather = useCallback((pal) => {
    if (requestedRef.current.has(pal.email)) return;
    requestedRef.current.add(pal.email);

    setWeatherByPal((prev) => ({ ...prev, [pal.email]: { loading: true } }));

    getLocationAndWeather(pal.lat, pal.lon)
      .then((result) =>
        setWeatherByPal((prev) => ({ ...prev, [pal.email]: { loading: false, data: result } }))
      )
      .catch((err) =>
        setWeatherByPal((prev) => ({
          ...prev,
          [pal.email]: { loading: false, error: err.message || "Could not load weather" }
        }))
      );
  }, []);

  // The cards show every online pal's weather without a click, so the
  // fetches start as soon as the list does - one per sharing pal.
  useEffect(() => {
    onlinePals.forEach(loadWeather);
  }, [onlinePals, loadWeather]);

  const renderPopupBody = (pal) => {
    const entry = weatherByPal[pal.email];
    if (!entry) return null;
    if (entry.loading) return <div style={styles.popupWeather}>Loading weather...</div>;
    if (entry.error) return <div style={styles.popupWeather}>{entry.error}</div>;

    const w = entry.data.weather;
    const address = formatAddress(entry.data);
    return (
      <div style={styles.popupWeather}>
        {address && <div>{address}</div>}
        <div>{w.icon} {w.condition}, {w.temp}°C</div>
        <div>Humidity {w.humidity}% · Wind {w.wind} km/h</div>
      </div>
    );
  };

  // "123 Main Road, Sea Point, Western Cape" - whichever parts exist.
  function formatAddress(data) {
    return [data.place.street, data.place.town, data.place.province]
      .filter(Boolean)
      .join(", ");
  }

  const renderPalCard = (pal) => {
    const online = pal.lat != null && pal.lon != null;
    const entry = weatherByPal[pal.email];

    return (
      <div key={pal.email} className="loc-pal-card" style={styles.palCard}>
        <div style={styles.palCardTop}>
          <AvatarImage id={pal.avatar} size={44} />
          <div style={styles.palCardIdentity}>
            <div style={styles.palCardName}>{`${pal.name} ${pal.surname}`.trim()}</div>
            <div style={styles.palCardStatus}>
              <span
                style={{
                  ...styles.statusDot,
                  background: online ? "#22c55e" : "#a3a3a3"
                }}
              />
              {online ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        {online ? (
          <div style={styles.palCardBody}>
            {(entry?.loading || !entry) && <div style={styles.palCardMuted}>Loading location...</div>}
            {entry?.error && <div style={styles.palCardMuted}>{entry.error}</div>}
            {entry?.data && (
              <>
                <div style={styles.palCardAddress}>{formatAddress(entry.data)}</div>
                <div style={styles.palCardWeather}>
                  {entry.data.weather.icon} {entry.data.weather.condition}, {entry.data.weather.temp}°C
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={styles.palCardBody}>
            <div style={styles.palCardMuted}>Not sharing their location</div>
          </div>
        )}
      </div>
    );
  };
  return (
    <div style={styles.page}>
      <style>{css}</style>
      <SideMenu title="Weather" theme="light" />

      <header className="loc-header" style={styles.header}>
        <div className="loc-header-inner" style={styles.headerInner}>
          <h1
            className="loc-logo"
            style={styles.logo}
            title="Back to Weather"
            onClick={() => navigate(VIEWS.WEATHER)}
          >
            Weather
          </h1>

          <div style={styles.actions}>
            <button
              type="button"
              className="loc-icon-btn"
              style={styles.iconButton}
              aria-label="Add friends"
              title="Add friends"
            >
              <FiUserPlus size={19} />
            </button>
            <button
              type="button"
              className="loc-icon-btn"
              style={styles.iconButton}
              aria-label="Notifications"
              title="Notifications"
            >
              <FiBell size={19} />
            </button>
          </div>
        </div>
      </header>

      <main className="loc-body" style={styles.body}>
        <SharelocationButton width="220px" height="48px" email={email} />

        <h2 style={styles.sectionTitle}>
          My pals
          {!loading && !error && pals.length > 0 && (
            <span style={styles.sectionCount}>{onlinePals.length} sharing</span>
          )}
        </h2>
        <p style={styles.sectionHint}>
          Tap a face on the map to see their weather.
        </p>

        {loading && <div style={styles.mapStatus}>Loading pals...</div>}
        {!loading && error && <div style={styles.mapStatus}>{error}</div>}

        {/* The map shows whatever there is: no sharing pals simply means
            an empty map, and the card list below still lists everyone. */}
        {!loading && !error && (
          <div className="loc-map-wrap" style={styles.mapWrap}>
            <MapContainer
              center={MAP_FALLBACK_CENTER}
              zoom={6}
              minZoom={6}
              maxZoom={19}
              maxBounds={SA_BOUNDS}
              maxBoundsViscosity={1.0}
              scrollWheelZoom
              style={{ width: "100%", height: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <InvalidateSizeOnLoad />
              <FitToPals markers={markers} />
              {markers.map((pal) => (
                <Marker
                  key={pal.email}
                  position={[pal.lat, pal.lon]}
                  icon={pal.icon}
                  eventHandlers={{ click: () => loadWeather(pal) }}
                >
                  <Popup>
                    <div style={styles.popupName}>
                      {`${pal.name} ${pal.surname}`.trim()}
                    </div>
                    <div style={styles.popupPlace}>{pal.email}</div>
                    {renderPopupBody(pal)}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        {!loading && !error && pals.length > 0 && (
          <div className="loc-pal-grid" style={styles.palGrid}>
            {pals.map(renderPalCard)}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#fafafa",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#1a1a1a"
  },
  header: {
    background: "#fff",
    borderBottom: "1px solid #e5e5e5",
    padding: "0 24px",
    position: "sticky",
    top: 0,
    zIndex: 10
  },
  headerInner: {
    maxWidth: "1200px",
    margin: "0 auto",
    minHeight: "70px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    paddingLeft: "72px" // clears the fixed 42px hamburger SideMenu parks at left: 14px
  },
  logo: {
    fontSize: "28px",
    fontWeight: 300,
    letterSpacing: "0.05em",
    margin: 0,
    color: "#1a1a1a",
    cursor: "pointer",
    userSelect: "none"
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  iconButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "40px",
    padding: 0,
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: "50%",
    color: "#1a1a1a",
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease"
  },
  body: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "28px 24px 80px"
  },
  sectionTitle: {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    fontSize: "24px",
    fontWeight: 400,
    margin: "32px 0 0",
    color: "#1a1a1a"
  },
  sectionCount: {
    fontSize: "13px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "#999"
  },
  sectionHint: {
    margin: "6px 0 0",
    fontSize: "14px",
    color: "#666"
  },
  mapWrap: {
    marginTop: "16px",
    height: "520px",
    borderRadius: "16px",
    overflow: "hidden",
    border: "1px solid #e5e5e5",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.06)",
    zIndex: 0, // leaflet panes otherwise float above the sticky header
    textAlign: "left" // #root centres its text; map popups should not inherit that
  },
  mapStatus: {
    marginTop: "16px",
    fontSize: "14px",
    color: "#666"
  },
  popupName: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#1a1a1a",
    marginBottom: "2px"
  },
  popupPlace: {
    fontSize: "12px",
    color: "#999",
    marginBottom: "8px"
  },
  popupWeather: {
    fontSize: "13px",
    color: "#1a1a1a",
    display: "flex",
    flexDirection: "column",
    gap: "2px"
  },
  palGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "14px",
    marginTop: "22px",
    textAlign: "left"
  },
  palCard: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: "16px",
    padding: "16px 18px",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease"
  },
  palCardTop: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  palCardIdentity: {
    minWidth: 0 // lets a long name ellipsis inside the flex row
  },
  palCardName: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#1a1a1a",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  palCardStatus: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "#666",
    marginTop: "2px"
  },
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0
  },
  palCardBody: {
    marginTop: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  palCardAddress: {
    fontSize: "13px",
    color: "#1a1a1a",
    lineHeight: 1.45
  },
  palCardWeather: {
    fontSize: "13px",
    color: "#666"
  },
  palCardMuted: {
    fontSize: "13px",
    color: "#999"
  }
};

const css = `
  .loc-logo { -webkit-tap-highlight-color: transparent; }
  .loc-logo:hover { color: #666; }
  .loc-icon-btn:hover { background: #f5f5f5 !important; border-color: #d4d4d4 !important; }
  .loc-icon-btn:active { transform: scale(0.94); }

  .leaflet-popup-content-wrapper { border-radius: 14px !important; }
  .leaflet-popup-content { margin: 12px 16px !important; }

  .loc-avatar-pin { background: transparent; border: none; }
  .loc-avatar-pin img {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: block;
    border: 3px solid #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    background: #fff;
  }

  .loc-pal-card:hover { border-color: #d4d4d4 !important; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06); }

  @media (max-width: 640px) {
    .loc-header { padding: 0 16px !important; }
    .loc-header-inner { padding-left: 62px !important; min-height: 60px !important; }
    .loc-logo { font-size: 22px !important; }
    .loc-body { padding: 18px 16px 64px !important; }
    .loc-map-wrap { height: 420px !important; }
  }
`;
