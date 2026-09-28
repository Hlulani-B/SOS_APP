/**
 * Navigation for the app shell.
 *
 * There is no router on purpose: the current view lives in localStorage under
 * `sa_view`, so a refresh lands back on the same screen and the address bar
 * never carries a hint of what the app actually is. Components call navigate()
 * rather than threading an onNavigate prop down through WeatherPage and
 * SideMenu, which would have to be repeated for every screen added later.
 */

export const VIEWS = {
  LOGIN: 'login',
  SETUP: 'setup',
  AVATAR: 'avatar',
  GUIDE: 'guide',
  GUIDE_SETTINGS: 'guide-settings',
  PALS: 'pals',
  WEATHER: 'weather',
  LOCATION: 'location',
};

export const VIEW_KEY = 'sa_view';

const NAV_EVENT = 'sos-navigate';
const ALL_VIEWS = Object.values(VIEWS);

/** The stored view, or the fallback if it is missing/unrecognised. */
export function readView(fallback = VIEWS.LOGIN) {
  const saved = localStorage.getItem(VIEW_KEY);
  return ALL_VIEWS.includes(saved) ? saved : fallback;
}

export function navigate(view) {
  if (!ALL_VIEWS.includes(view)) {
    console.warn(`navigate: unknown view "${view}"`);
    return;
  }
  localStorage.setItem(VIEW_KEY, view);
  // The native "storage" event only fires in *other* tabs, so a private event
  // covers same-tab navigation while the listener below covers the rest.
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** Re-read the view on same-tab and cross-tab changes. Returns an unsubscriber. */
export function subscribeToNavigation(listener) {
  window.addEventListener(NAV_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(NAV_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
