import { signOut } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth } from './firebase.js';
import { VIEWS, navigate, VIEW_KEY } from './navigation.js';
import { stop as stopLiveLocation } from './functions/liveLocation.js';

/**
 * Session helpers - the small amount of state that outlives a single screen.
 *
 * EMAIL_KEY is exported so App.jsx and anything else that needs "who is
 * signed in" reads one key rather than each hard-coding its own.
 */
export const EMAIL_KEY = 'sos_email';

/**
 * Ends the session properly.
 *
 * Firebase keeps the signed-in user in IndexedDB (web) or in the platform
 * Firebase SDK (native app) independently of anything this app stores, so
 * clearing localStorage is not enough: on the next mount login.jsx would see
 * a live session and sign her straight back in. The matching signOut has to
 * come first - web auth on a browser, the plugin inside the packaged app.
 */
export async function logOut() {
  // End any live share first: this clears the persisted refresh-resume flag
  // and wipes the stored coordinates server-side, so signing out can never
  // leave a background timer broadcasting her location or a flag that would
  // silently resume under the next account.
  stopLiveLocation();
  if (Capacitor.isNativePlatform()) {
    await FirebaseAuthentication.signOut();
  } else {
    await signOut(auth);
  }
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(VIEW_KEY);
  navigate(VIEWS.LOGIN);
}
