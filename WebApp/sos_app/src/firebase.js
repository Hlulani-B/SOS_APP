import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

/**
 * Firebase is the authentication layer only: it owns the Google sign-in
 * popup and the resulting session. App data still lives entirely in Neon
 * Postgres behind the Express API - nothing here reads or writes a Firestore
 * or Realtime Database collection, and that split is deliberate.
 *
 * The six config values below are public by design (they identify a project,
 * they do not authenticate a server). They come from
 * Firebase console -> Project settings -> Your apps -> SDK setup.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// requestEmailVerification is off: the Google account already proves the
// address, and the app has no password path to verify against.
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
