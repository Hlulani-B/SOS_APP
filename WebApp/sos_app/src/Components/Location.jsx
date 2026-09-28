import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiBell, FiUserPlus, FiX } from "react-icons/fi";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import SideMenu from "./SideMenu.jsx";
import SharelocationButton from "./SharelocationButton.jsx";
import AddPalForm from "./AddPalForm.jsx";
import { AvatarImage, avatarSrc } from "./avatars.jsx";
import { get_pals, get_invites, get_sent_invites, accept_invite } from "../functions/apiPals.js";
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
 * The two header actions open modal panels over the page: the bell is the
 * notifications view (invites sent, with their status, above the pending
 * invites addressed to you with accept/reject; badge counts the latter) and
 * the right-hand user-plus is the add-a-pal invite form - the same form the
 * onboarding step shows. Accepting an invite links the pair server-side, so
 * the pal list reloads right after.
 *
 * The body is a leaflet map of every pal who is live-sharing: get_pals
 * supplies the emails, getProfiles the names + avatars and
 * getLocationsByEmails the coordinates. The whole list is re-read every
 * PALS_POLL_MS, matching the sharing broadcast cadence, so a pal coming
 * online or going quiet shows up without a reload. Markers carry the pal's avatar;
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

// pals re-read cadence; mirrors INTERVAL_MS in functions/liveLocation.js so
// the map moves within one broadcast of the sharing side sending it.
const PALS_POLL_MS = 10000;

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

// Cheap pal-list equality. When nothing moved, the 10s poll keeps the old
// array reference so React skips the re-render - without this, every tick
// would hand FitToPals a fresh markers array and yank the viewport back
// to the fitted bounds while the user is mid-pan.
function samePals(a, b) {
  if (a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    return (
      p.email === q.email &&
      p.name === q.name &&
      p.surname === q.surname &&
      p.avatar === q.avatar &&
      p.lat === q.lat &&
      p.lon === q.lon
    );
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
  // null | "add" | "invites": which header modal panel is open.
  const [panel, setPanel] = useState(null);
  const [invites, setInvites] = useState([]);
  // invites the user sent, in every status - shown above the received ones
  const [sentInvites, setSentInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState(null);
  // id of the invite whose Accept/Reject is in flight (disables both rows' buttons)
  const [inviteBusy, setInviteBusy] = useState(null);
  // bump to re-run the pals load without changing email (after an accept)
  const [reloadTick, setReloadTick] = useState(0);

  // Sharing devices tick every 10s (functions/liveLocation.js), so reading
  // the table on the same cadence turns a pal online/offline within one
  // broadcast instead of only on page load.
  useEffect(() => {
    let cancelled = false;
    let booted = false; // first load done (success or failure)?
    let inFlight = false; // never overlap a slow fetch with the next tick

    async function loadPals() {
      if (inFlight) return;
      inFlight = true;
      // Only the first load may blank the map via loading/error - a poll
      // that briefly fails keeps the last known picture on screen.
      if (!booted) setError(null);
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
          setPals((prev) => {
            const next = profiles.map((profile) => ({
              email: profile.email,
              name: profile.name,
              surname: profile.surname,
              avatar: profile.avatar,
              lat: locationByEmail.get(profile.email) ? Number(locationByEmail.get(profile.email).latitude) : null,
              lon: locationByEmail.get(profile.email) ? Number(locationByEmail.get(profile.email).longitude) : null
            }));
            return samePals(prev, next) ? prev : next;
          });
        }
      } catch (err) {
        if (!cancelled && !booted) setError(err.message || "Could not load pals");
      } finally {
        inFlight = false;
        if (!cancelled) {
          booted = true;
          setLoading(false);
        }
      }
    }

    loadPals();
    const timer = setInterval(loadPals, PALS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [email, reloadTick]);

  const refreshInvites = useCallback(async () => {
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      // Settled, not all: the two halves of the panel stand on their own, so
      // an API build that predates get_sent_invites (or a single failed read)
      // still shows the invites that did load instead of sinking both.
      const [received, sent] = await Promise.allSettled([
        get_invites(email),
        get_sent_invites(email),
      ]);
      if (received.status === "fulfilled") setInvites(received.value);
      if (sent.status === "fulfilled") setSentInvites(sent.value);
      if (received.status === "rejected") {
        setInvitesError(received.reason?.message || "Could not load invitations");
      }
    } finally {
      setInvitesLoading(false);
    }
  }, [email]);

  // Loaded on mount so the bell badge is honest before the panel is opened.
  useEffect(() => {
    refreshInvites();
  }, [refreshInvites]);

  async function answerInvite(invite, status) {
    setInviteBusy(invite.id);
    setInvitesError(null);
    try {
      // Backend order is (inviter, invitee, status): the invitee is the one
      // answering an invite that came TO them.
      await accept_invite(invite.inviter, email, status);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (status === "accepted") setReloadTick((t) => t + 1);
    } catch (err) {
      setInvitesError(err.message || "Could not answer the invitation");
    } finally {
      setInviteBusy(null);
    }
  }

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
              aria-label="Invitations"
              title="Invitations"
              onClick={() => setPanel("invites")}
            >
              <span style={styles.bellWrap}>
                <FiBell size={19} />
                {invites.length > 0 && (
                  <span style={styles.badge}>{invites.length}</span>
                )}
              </span>
            </button>
            <button
              type="button"
              className="loc-icon-btn"
              style={styles.iconButton}
              aria-label="Add a pal"
              title="Add a pal"
              onClick={() => setPanel("add")}
            >
              <FiUserPlus size={19} />
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

      {/* One modal host for both header actions; the backdrop click and the
          X both close it. stopPropagation keeps clicks inside the card from
          reaching the backdrop handler. */}
      {panel && (
        <div
          className="loc-modal-backdrop"
          style={styles.modalBackdrop}
          onClick={() => setPanel(null)}
        >
          <div
            className="loc-modal"
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={panel === "add" ? "Add a pal" : "Notifications"}
          >
            <div style={styles.modalHead}>
              <h2 style={styles.modalTitle}>
                {panel === "add" ? "Add a pal" : "Notifications"}
              </h2>
              <button
                type="button"
                className="loc-modal-close"
                style={styles.modalClose}
                aria-label="Close"
                onClick={() => setPanel(null)}
              >
                <FiX size={18} />
              </button>
            </div>

            {panel === "add" ? (
              <>
                <p style={styles.modalHint}>
                  Enter the email address they sign in with. They'll appear on
                  your map as soon as they accept.
                </p>
                <AddPalForm email={email} onAdded={() => refreshInvites()} />
              </>
            ) : (
              <div style={styles.inviteList}>
                {invitesLoading && invites.length === 0 && sentInvites.length === 0 && (
                  <div style={styles.palCardMuted}>Loading invitations...</div>
                )}
                {invitesError && (
                  <div style={styles.inviteError}>{invitesError}</div>
                )}

                <div style={styles.inviteSection}>Invites you sent</div>
                {!invitesLoading && !sentInvites.length && (
                  <div style={styles.palCardMuted}>
                    You haven't invited anyone yet.
                  </div>
                )}
                {sentInvites.map((invite) => {
                  const status = SENT_STATUS[invite.status] || SENT_STATUS.pending;
                  return (
                    <div key={invite.id} style={styles.inviteRow}>
                      <div style={styles.inviteFrom} title={invite.invitee}>
                        {invite.invitee}
                      </div>
                      <div
                        style={{ ...styles.sentStatus, color: status.color }}
                      >
                        {status.label}
                      </div>
                    </div>
                  );
                })}

                <div style={styles.inviteSection}>Invites for you</div>
                {!invitesLoading && !invites.length && !invitesError && (
                  <div style={styles.palCardMuted}>
                    No invitations waiting on you.
                  </div>
                )}
                {invites.map((invite) => (
                  <div key={invite.id} style={styles.inviteRow}>
                    <div style={styles.inviteFrom} title={invite.inviter}>
                      {invite.inviter}
                    </div>
                    <div style={styles.inviteBtns}>
                      <button
                        type="button"
                        className="loc-invite-accept"
                        disabled={inviteBusy === invite.id}
                        onClick={() => answerInvite(invite, "accepted")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="loc-invite-reject"
                        disabled={inviteBusy === invite.id}
                        onClick={() => answerInvite(invite, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
  },
  bellWrap: {
    position: "relative",
    display: "flex"
  },
  badge: {
    position: "absolute",
    top: "-7px",
    right: "-8px",
    minWidth: "16px",
    height: "16px",
    padding: "0 4px",
    boxSizing: "border-box",
    borderRadius: "8px",
    background: "#ef4444",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    lineHeight: "16px",
    textAlign: "center"
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.4)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "80px 16px 24px",
    // Above everything Leaflet stacks inside the map container (panes top
    // out at 700, controls at 800) - at 100 the modal sank behind the map.
    zIndex: 1000
  },
  modal: {
    width: "100%",
    maxWidth: "440px",
    background: "#fff",
    borderRadius: "16px",
    border: "1px solid #e5e5e5",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.18)",
    padding: "18px 20px 22px",
    textAlign: "left"
  },
  modalHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "4px"
  },
  modalTitle: {
    fontSize: "18px",
    fontWeight: 600,
    margin: 0,
    color: "#1a1a1a"
  },
  modalClose: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    padding: 0,
    background: "transparent",
    border: "none",
    borderRadius: "50%",
    color: "#666",
    cursor: "pointer"
  },
  modalHint: {
    fontSize: "13px",
    color: "#666",
    margin: "6px 0 14px",
    lineHeight: 1.5
  },
  inviteList: {
    display: "flex",
    flexDirection: "column",
    marginTop: "8px"
  },
  inviteRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 0",
    borderBottom: "1px solid #f0f0f0"
  },
  inviteFrom: {
    fontSize: "14px",
    color: "#1a1a1a",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  inviteBtns: {
    display: "flex",
    gap: "8px",
    flexShrink: 0
  },
  inviteSection: {
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#8a8a8a",
    margin: "14px 0 2px"
  },
  sentStatus: {
    fontSize: "13px",
    fontWeight: 600,
    flexShrink: 0,
    whiteSpace: "nowrap"
  },
  inviteError: {
    fontSize: "13px",
    color: "#b91c1c",
    padding: "8px 0"
  }
};

// How a sent invite's status reads in the notifications panel.
const SENT_STATUS = {
  pending: { label: "Waiting", color: "#b45309" },
  accepted: { label: "Friends", color: "#16a34a" },
  rejected: { label: "Declined", color: "#dc2626" },
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

  .loc-modal-close:hover { background: #f5f5f5 !important; color: #1a1a1a !important; }

  .loc-invite-accept,
  .loc-invite-reject {
    border: none;
    border-radius: 999px;
    padding: 7px 14px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .loc-invite-accept { background: #2563eb; color: #fff; }
  .loc-invite-accept:hover:not(:disabled) { background: #1d4ed8; }
  .loc-invite-reject { background: #f0f0f0; color: #1a1a1a; }
  .loc-invite-reject:hover:not(:disabled) { background: #e0e0e0; }
  .loc-invite-accept:disabled,
  .loc-invite-reject:disabled { opacity: 0.55; cursor: default; }

  @media (max-width: 640px) {
    .loc-modal-backdrop { padding: 64px 12px 16px !important; }
  }

  @media (max-width: 640px) {
    .loc-header { padding: 0 16px !important; }
    .loc-header-inner { padding-left: 62px !important; min-height: 60px !important; }
    .loc-logo { font-size: 22px !important; }
    .loc-body { padding: 18px 16px 64px !important; }
    .loc-map-wrap { height: 420px !important; }
  }
`;
