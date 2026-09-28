import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import { VIEWS, navigate, VIEW_KEY } from './navigation.js';

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
 * Firebase keeps the signed-in user in IndexedDB independently of anything
 * this app stores, so clearing localStorage is not enough: on the next mount
 * login.jsx's onAuthStateChanged would see a live session and sign her
 * straight back in. signOut() has to come first.
 */
export async function logOut() {
  await signOut(auth);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(VIEW_KEY);
  navigate(VIEWS.LOGIN);
}
