import { useEffect, useState } from 'react'
import { auth } from './firebase.js'
import Login from './Components/login.jsx'
import SetupPage from './Components/SetupPage.jsx'
import AvatarPage from './Components/AvatarPage.jsx'
import GuidePage from './Components/GuidePage.jsx'
import WeatherPage from './Components/WeatherPage.jsx'
import LocationPage from './Components/Location.jsx'
import { VIEWS, readView, navigate, subscribeToNavigation } from './navigation.js'
import { EMAIL_KEY } from './session.js'
import { restore as restoreLiveLocation } from './functions/liveLocation.js'
import './App.css'

/**
 * The app shell: a small view state machine, no router library.
 *
 * Following the README's house pattern, the current view lives in
 * localStorage rather than the URL, so navigation leaves no address-bar
 * trail and survives a refresh mid-onboarding.
 *
 * The route is decided by Checkuser(email) inside login.jsx:
 *   row exists -> weather          (returning user, straight in)
 *   no row     -> setup -> avatar -> guide -> weather
 *
 * VIEWS and the storage key live in navigation.js so SideMenu and every later
 * screen can move the app without a callback being drilled down to them.
 */

// On a refresh mid-setup the login callback is long gone, but the Firebase
// session is not - so re-derive the name pre-fill from it.
function presetFromSession() {
  const parts = String(auth.currentUser?.displayName || '').trim().split(/\s+/)
  return { name: parts[0] || '', surname: parts.slice(1).join(' ') || '' }
}

function App() {
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '')
  const [view, setView] = useState(() =>
    localStorage.getItem(EMAIL_KEY) ? readView() : VIEWS.LOGIN
  )
  const [preset, setPreset] = useState(presetFromSession)

  // navigate() only writes localStorage and fires an event - this is what
  // turns that into a re-render, so any component can move the app.
  useEffect(() => subscribeToNavigation(() => setView(readView())), [])

  // A refresh wipes the in-memory share timer; if she was mid-share, pick it
  // back up now that we know who is signed in (see functions/liveLocation.js).
  useEffect(() => {
    if (email) restoreLiveLocation(email)
  }, [email])

  function go(next) {
    navigate(next)
  }

  function handleLogin(nextEmail, { isNew, preset: profile }) {
    setEmail(nextEmail)
    localStorage.setItem(EMAIL_KEY, nextEmail)
    if (profile) setPreset(profile)
    go(isNew ? VIEWS.SETUP : VIEWS.WEATHER)
  }

  if (!email || view === VIEWS.LOGIN) {
    return <Login onSuccess={handleLogin} />
  }

  if (view === VIEWS.SETUP) {
    return (
      <SetupPage
        email={email}
        preset={preset}
        onComplete={() => go(VIEWS.AVATAR)}
      />
    )
  }

  if (view === VIEWS.AVATAR) {
    return <AvatarPage email={email} onComplete={() => go(VIEWS.GUIDE)} />
  }

  if (view === VIEWS.GUIDE) {
    return <GuidePage onComplete={() => go(VIEWS.WEATHER)} />
  }

  if (view === VIEWS.GUIDE_SETTINGS) {
    // Same explainer reached from the menu, standalone variant: no step
    // breadcrumb, and its button heads back to Weather (the app home).
    return <GuidePage variant="settings" onComplete={() => go(VIEWS.WEATHER)} />
  }

  if (view === VIEWS.LOCATION) {
    return <LocationPage email={email} />
  }

  return <WeatherPage />
}

export default App
