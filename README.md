# SOS App — a safety tool disguised as a weather app

> A covert personal-safety application for people at risk of gender-based
> violence. To anyone glancing over a shoulder it is a plain weather app; to
> its owner it is a one-tap way to record audio/video and send her live
> location to trusted contacts.

This repository contains the **cloud-backed rewrite** of the app:

- **`WebApp/sos_app/`** — the React front end (the weather disguise).
- **`api/`** — an Express + Neon Postgres back end.
- **`SOS/sos/`** — the older, fully offline prototype (no server). Kept for
  reference; it is excluded from the deployed app and from git.
- **`voicewake/`** — an unrelated, separate Expo/React-Native experiment. Also
  excluded from this repo.
- **`database.md`** — the Neon schema notes.

`render.yaml` at the root deploys the two live services (API + web) to Render.

---

## 1. The problem

A panic button only works if the person who needs it can reach it **without
the attacker noticing**. Existing safety apps betray themselves: a red SOS
icon, a "Send help" button, a screen that screams *victim* if a phone is
grabbed and looked at. The moment a device is physically inspected, the app
becomes evidence — and the danger spikes.

The requirements that fall out of this:

1. **It must not look like a safety app.** The whole UI has to read as
   something boring and plausible that a person would legitimately open.
2. **Help must be reachable in a single, deniable gesture** — no unlock, no
   menu-diving, no visible confirmation, because there may be no time and no
   privacy.
3. **The people who get alerted must be chosen by her**, and nothing may be
   sent without her tapping.
4. **Her location must be shareable live** so contacts can find her, and
   *sharing must not silently stop* when she navigates around the app.
5. **Cover must survive scrutiny**: the browser tab title, the branding, and
   every on-screen string must stay innocuous.

The chosen disguise is a **weather app** — universally boring, plausible to
open at any hour, and it naturally explains a screen full of city names and
map coordinates.

---

## 2. How it works (the disguise)

The weather screen lists ordinary cities. Three of them carry a small
**coloured dot**; the colour is the only label, and a single tap both loads
that city's forecast *and* fires its hidden action:

| City | Dot colour | Hidden action |
|------|-----------|---------------|
| Johannesburg | olive `#556b2f` | start recording **video** |
| Durban | yellow `#eab308` | start recording **audio** |
| Cape Town | pink `#ff2d75` | send **alert + live location** to pals |

A recording is live only while its city chip is red; tapping the same chip
again stops it and sends what was captured to the user's pre-selected
contacts. Nothing is written on the buttons, so the screen looks identical to
anyone else. The colours above are the single source of truth in
`WebApp/sos_app/src/Components/WeatherPage.jsx` (`ACTION_COLORS`) — the
onboarding guide mirrors them, so the two must be kept in step.

A second screen, **Location**, shows the user's trusted contacts ("pals") on
a map and lets her broadcast her own live position.

---

## 3. How it was implemented

### 3.1 Architecture at a glance

```
 Browser (weather disguise)                Express API                 Neon Postgres
 WebApp/sos_app  (React 19 + Vite)  ──►   api/  (function dispatcher) ──►  users / locations / invite
        │                                        ▲
        │  Firebase Google sign-in               │  one pooled connection
        └── credentials only ────────► auth ─────┘  (data keyed by email)
```

Auth and data are deliberately split across **two backends**:

- **Firebase** handles *only* Google sign-in and the session
  (`signInWithPopup`, falling back to `signInWithRedirect` when a popup is
  blocked). It stores no app data.
- **Neon Postgres** is the sole store of application data.
- The **email** is the bridge: after a Firebase login the app calls
  `Checkuser(email)` to decide whether the account is new.

### 3.2 Front end (`WebApp/sos_app`)

- **React 19 + Vite 8**, no router on purpose. Screen routing is a
  **localStorage state machine** (`src/navigation.js`, keys `sa_view` and
  `sos_email`): a refresh lands back on the same screen and the address bar
  never carries a hint of what the app is. `App.jsx` reads the view and renders
  the matching screen.
- **Onboarding flow**: `login → (new user) setup → avatar → guide → weather`;
  a returning user goes straight to weather. The `users` row is created in
  **SetupPage**, not at login, so re-running onboarding never collides with the
  email primary key.
- **Avatars** (`Components/avatars.jsx`): a set of hosted DiceBear/OpenMoji
  images; only the short id (e.g. `"fox"`) is persisted, never the URL, so the
  set can later be re-pointed at bundled local files for an offline mobile
  wrap without a data migration.
- **Location screen** (`Components/Location.jsx`): a `react-leaflet` map
  **constrained to South Africa** (`maxBounds`, `minZoom 6`, `maxZoom 19`) so it
  reads as a real local-weather map and zooms deep enough to show street names.
  Each pal who is sharing appears as an **avatar marker**; below the map a card
  per pal shows online/offline, and for online pals the **street / town /
  province plus the current weather there**.
- **Live location sharing** (`functions/liveLocation.js`): the share loop lives
  in a module-level singleton, not in a component, so it keeps running when the
  Location page unmounts. The sharing email is mirrored to `localStorage` and
  resumed on boot, so a **page refresh does not drop the share**; it is cleared
  on stop and on logout.

### 3.3 Back end (`api`)

- **Express 5** exposing a **generic function dispatcher** rather than one
  endpoint per operation. Each module is mounted at `POST /api/<module>` and
  takes a body of `{ "function": "<methodName>", "params": [ ...positional ] }`,
  returning `{ ok, data }` or `{ ok: false, error }`.
  - `/api/location` → `addEmail`, `ShareLocation`, `StopLiveLocation`, `getLocationsByEmails`
  - `/api/pals` → `send_invite`, `get_invites`, `get_pals`, `make_pals`, `accept_invite`, `remove_pal`
  - `/api/users` → `Checkuser`, `getFullName`, `getProfiles`, `addUser`, `setName`, `setSurname`, `setAvatar`
- **Safety of the dispatcher**: every route holds an explicit **allowlist** of
  callable names, rejects cross-module names, and blocks prototype keys like
  `__proto__` / `constructor`. A trailing Express error handler and a catch-all
  404 keep every response JSON (otherwise a malformed body would leak an HTML
  error page).
- **Neon** via `@neondatabase/serverless`, a single shared **pooled**
  connection from `DATABASE_URL`. All SQL is parameterised.
- **CORS** is an opt-in allowlist (`CORS_ORIGINS`) used only once the front end
  is on a different origin; local dev stays same-origin through the Vite proxy.

### 3.4 Data flow for the map

`get_pals(email)` → the pal emails → `getProfiles(emails)` (names + avatars)
and `getLocationsByEmails(emails)` (coordinates, only rows where lat/long are
non-null) are fetched together and merged: every pal shows up, and the ones
without coordinates simply render as offline.

### 3.5 Address + weather resolution

A pal's card shows a real address and the weather there, assembled from three
free sources, each verified live:

- **Open-Meteo** — current weather (no key required).
- **BigDataCloud** reverse-geocode — town / province (its free tier never
  returns street fields).
- **Nominatim** reverse-geocode — the street. It enforces **1 request/second**
  and rejects generic user-agents, so all Nominatim calls are serialised through
  a shared promise queue with ~1100 ms spacing.

### 3.6 Deployment

`render.yaml` is a Render blueprint with two services: **`sos-api`** (the Node
back end) and **`sos-web`** (the built static front end). Secrets are not
hardcoded: `sync: false` env vars make Render prompt for them in the dashboard
at create time. The front end reads its back-end URL from `VITE_API_BASE`.

---

## 4. Getting started

### Prerequisites

- **Node.js 22** (matches the Render `NODE_VERSION`).
- A **Neon** Postgres project (pooled connection string).
- A **Firebase** project with the **Google** provider enabled and
  `http://localhost:5173` (and your deployed origin) added to *Authorized
  domains*.

### 1. Back end

```bash
cd api
npm install
# create api/.env:
#   DATABASE_URL=postgresql://...-pooler...?sslmode=require&channel_binding=require
#   CORS_ORIGINS=            # leave empty for local dev
npm run dev                  # nodemon on http://localhost:3000
```

`GET http://localhost:3000/` returns the list of routes and callable functions.

### 2. Front end

```bash
cd WebApp/sos_app
npm install
# create WebApp/sos_app/.env with your Firebase values (see .env.example):
#   VITE_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / STORAGE_BUCKET /
#   VITE_FIREBASE_MESSAGING_SENDER_ID / VITE_FIREBASE_APP_ID
#   VITE_API_BASE=           # leave EMPTY for local dev (uses the Vite proxy)
npm run dev                  # http://localhost:5173
```

In dev the Vite proxy forwards `/api/*` to `localhost:3000`, so there is no CORS
and `VITE_API_BASE` stays empty. Set `VITE_API_BASE` only when pointing the
front end at a deployed API.

### 3. Tests

A curl regression suite exercises routing, dispatcher guards, and the live
database paths:

```bash
cd api
powershell -ExecutionPolicy Bypass -File tests/curl_tests.ps1
# or against a deployment:
powershell -ExecutionPolicy Bypass -File tests/curl_tests.ps1 -Base "https://<your-api>.onrender.com"
```

### Environment variables

| Where | Key | Purpose |
|-------|-----|---------|
| `api/.env` | `DATABASE_URL` | Neon pooled connection string (**secret**) |
| `api/.env` | `CORS_ORIGINS` | comma-separated allowed front-end origins |
| `WebApp/sos_app/.env` | `VITE_FIREBASE_*` (6) | Firebase project identity (public by design) |
| `WebApp/sos_app/.env` | `VITE_API_BASE` | deployed API URL; empty ⇒ use dev proxy |

> Real `.env` files are **git-ignored**; only `.env.example` templates are
> committed. Anything prefixed `VITE_` is baked into the public browser bundle —
> never put a secret behind it.

---

## 5. Challenges faced

These are the problems that actually cost time, grouped by why they were
non-obvious.

**Windows hides bugs that break Linux.** The folder was committed as
`api/Routes/` but imported as `./routes/`. It ran fine locally (case-insensitive
filesystem) and crash-looped on Render's Linux with `ERR_MODULE_NOT_FOUND`. Fixed
with a two-step `git mv` case rename. Lesson: a local "it works" is not proof of
case-correctness.

**The Render blueprint schema is stricter than it looks.** A static site is
`type: web` with `runtime: static` + `staticPublishPath`; `type: static` is not a
valid type at all. And `sync: false` env vars don't fail — they make the blueprint
sit "Running" while it waits for you to type the secrets into the dashboard.

**The share loop died on navigation.** Because there is no router, switching to
the Weather page *unmounted* the Location page, and a `setInterval` living in the
component's `useEffect` was torn down with it — sharing silently stopped exactly
when you were least likely to be looking at the map. Moving the timer into a
module-level singleton (then persisting it across refreshes) fixed it.

**Free geocoding APIs each have a catch.** BigDataCloud's free tier never returns
street names; Nominatim does but throttles to 1 req/s and 403-blocks generic
user-agents. The address is therefore a three-source chain with a rate-limited,
serialised Nominatim queue and graceful degradation when a field is missing.

**Postgres types are not what they look like.** `NUMERIC` coordinates come back
from the driver as **strings** (`"-33.920000"`), needing an explicit `Number()`
before they can be plotted. And the dispatcher passes `params` as **positional**
arguments, so a function taking an array must be called with a *nested* array or
Postgres throws `malformed array literal`.

**"No server" vs. "needs a server."** The original `SOS/sos` prototype's whole
safety model was *"no accounts, no server, no database"* — every natural feature
(a contacts list, message history) would create a server-side trail linking a
victim to a safety tool. This cloud-backed version deliberately trades some of
that purity for cross-device pals and live location, which is a real tension to
weigh before deploying.

**Logging out is not clearing localStorage.** Firebase keeps the session in
IndexedDB, so wiping the app's own keys just bounced the user straight back in.
Sign-out has to call `signOut(auth)` first.

**The build/lint can't catch a bad import.** Renaming one import symbol left a
runtime `ReferenceError` that both `vite build` and `oxlint` passed cleanly — only
a browser run surfaced it.

**PowerShell 5.1 mangles curl payloads**, stripping embedded quotes and
interpolating `$1`. The test suite writes JSON bodies to a temp file and passes
them via `--data "@file"` rather than inline.

---

## 6. Repository layout

```
.
├── api/                 Express + Neon back end (function dispatcher)
│   ├── functions/        feature classes (location, pals, users)
│   ├── routes/           one allowlisted router per module
│   ├── caller.js         positional dispatcher
│   ├── db.js             shared Neon pool
│   └── tests/            curl regression suite
├── WebApp/sos_app/      React 19 + Vite weather disguise
│   └── src/
│       ├── Components/   screens (login, setup, avatar, guide, weather, location)
│       ├── functions/    API fetch wrappers + liveLocation + geocoding
│       ├── navigation.js localStorage view state machine
│       └── session.js    Firebase sign-out + email key
├── render.yaml          Render blueprint (sos-api + sos-web)
├── database.md          Neon schema notes
├── SOS/                 legacy offline prototype (not deployed, git-ignored)
└── voicewake/           unrelated Expo experiment (git-ignored)
```
