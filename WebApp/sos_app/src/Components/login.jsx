import { useEffect, useRef, useState } from "react";
import { signInWithPopup, signInWithRedirect, onAuthStateChanged } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth, googleProvider } from "../firebase.js";
import { Checkuser } from "../functions/apiUsers.js";
import loginArt from "../assets/safe_login_art.png";

/**
 * "Continue with Google", laid out as a two-column sign-in screen:
 * illustration left, form right. The button runs two different flows behind
 * one label: the browser keeps Firebase's popup (falling back to a redirect
 * when blocked), while the packaged Capacitor app signs in through the
 * native Google flow via @capacitor-firebase/authentication - the popup
 * cannot work there because the WebView's custom-scheme origin can never be
 * a Firebase Authorized domain. Both paths hand the same { email,
 * displayName } shape to routeUser, so nothing downstream notices.
 *
 * Firebase owns credentials and session persistence only. The Neon half is
 * unchanged: Checkuser(email) decides where the app goes next -
 *   row exists  -> straight to the weather screen
 *   no row      -> the setup flow (name -> avatar -> guide -> weather)
 *
 * Login no longer creates the users row. It cannot: the row needs a name, and
 * a Google displayName is not something to write into a survivor's record
 * without her confirming it. SetupPage does the insert.
 *
 * onSuccess(email, { isNew, preset }) hands the app the email every backend
 * function keys on, plus a name/surname guess pre-filled from the Google
 * profile so setup can start pre-typed.
 *
 * Naming follows the project's covertness rule (README: the tab title and any
 * visible branding must never reveal the app's purpose). The screen therefore
 * presents itself as an ordinary "Weather App" sign-in - no shield, no
 * "SOS", and no hint of the other disguises.
 */

// One platform check for the whole module: native = packaged Capacitor app,
// web = browser (dev server and the deployed site alike).
const IS_NATIVE = Capacitor.isNativePlatform();

// "Baloy Njoku" -> { name: "Baloy", surname: "Njoku" }; a single word becomes
// the name, and a missing displayName yields empty strings for the row.
function splitDisplayName(displayName) {
  const parts = String(displayName || "").trim().split(/\s+/);
  return { name: parts[0] || "", surname: parts.slice(1).join(" ") || "" };
}

export default function Login({ onSuccess }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Guards against routing the same user twice: the popup resolves AND
  // onAuthStateChanged fires for the same sign-in.
  const routedRef = useRef(false);

  // Verified by Firebase -> ask Neon whether this email already has a row,
  // then hand the email and the routing decision to the app.
  async function routeUser(user) {
    if (routedRef.current || !user?.email) return;
    routedRef.current = true;

    const email = user.email.toLowerCase();
    const isNew = !(await Checkuser(email));

    localStorage.setItem("sos_email", email);
    onSuccess?.(email, { isNew, preset: splitDisplayName(user.displayName) });
  }

  useEffect(() => {
    document.title = "Weather App";
  }, []);

  useEffect(() => {
    if (IS_NATIVE) {
      // The native plugin keeps its session in the platform Firebase SDK -
      // the JS auth object never sees it, so onAuthStateChanged stays silent
      // here and a returning user is picked up via getCurrentUser instead
      // (null user just means the login screen stays put).
      FirebaseAuthentication.getCurrentUser()
        .then(({ user }) => (user ? routeUser(user) : null))
        .catch((err) => setError(err.message));
      return;
    }
    // Also covers a returning user whose Firebase session was restored from
    // storage, so the app skips the popup entirely.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        routeUser(user).catch((err) => setError(err.message));
      } else {
        routedRef.current = false;
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGoogle() {
    setError("");
    setNotice("");
    setBusy(true);

    if (IS_NATIVE) {
      try {
        // user arrives null when the Google sheet is dismissed without
        // choosing an account - not an error, just put the button back.
        const { user } = await FirebaseAuthentication.signInWithGoogle();
        if (user?.email) await routeUser(user);
      } catch (err) {
        setError(err.message || "Google sign-in failed.");
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      await signInWithPopup(auth, googleProvider);
      // routeUser runs via the onAuthStateChanged listener above.
    } catch (err) {
      // A blocked or dismissed popup leaves the user on this screen, so make
      // the fallback decision visible rather than failing silently.
      if (err.code === "auth/popup-blocked") {
        setNotice("Popup blocked — opening Google in this tab instead.");
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          setError(redirectError.message);
        }
      } else if (err.code === "auth/operation-not-allowed") {
        setError("Enable the Google provider in Firebase console → Authentication → Sign-in method.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError(`Add "${window.location.host}" to Firebase console → Authentication → Settings → Authorized domains.`);
      } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        setError(err.message || "Google sign-in failed.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-art">
        <img
          src={loginArt}
          width="1024"
          height="1024"
          alt="A mother kneeling with her three children behind a protective shield"
        />
      </div>

      <div className="login-form">
        <span className="login-brand">Weather App</span>

        <h1 className="login-title">Welcome</h1>
        <p className="login-lede">
          Sign in to keep your saved locations and forecasts in sync across
          your devices.
        </p>

        {error && <div className="login-error">{error}</div>}
        {notice && <div className="login-notice">{notice}</div>}

        <button
          type="button"
          className="login-google"
          onClick={handleGoogle}
          disabled={busy}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          {busy ? "Waiting for Google…" : "Continue with Google"}
        </button>

        <p className="login-fine">
          Help goes only to the contacts you add yourself. Nothing is sent and
          no one is told anything unless you tap first.
        </p>
      </div>
    </div>
  );
}
