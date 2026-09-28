import express from 'express';
import cors from 'cors';
import locationRouter from './routes/location.js';
import palsRouter from './routes/pals.js';
import usersRouter from './routes/users.js';

const app = express();

// Locally the frontend talks to this server through the Vite proxy (same
// origin, no CORS involved); a deployed frontend on another origin needs
// explicit permission.
//
// The deployed origins below are ALWAYS allowed (merged, not replaced), so a
// stale or missing CORS_ORIGINS on Render can never lock the live site out.
// CORS_ORIGINS is purely additive: list any extra dev/preview origins there
// comma-separated and they join this set. Capacitor WebView origins (Android
// https/http localhost + iOS custom scheme) are included so the packaged app
// can reach this API too.
const DEPLOYED_ORIGINS = [
  'https://sos-web-gdf3.onrender.com',
  'https://sos-web.onrender.com',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
];

const envOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Dedupe the union so a value listed in both places is not repeated.
const allowedOrigins = [...new Set([...DEPLOYED_ORIGINS, ...envOrigins])];
if (allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins }));
}

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    routes: {
      '/api/location': ['addEmail', 'ShareLocation', 'StopLiveLocation', 'getLocationsByEmails'],
      '/api/pals': [
        'send_invite',
        'get_invites',
        'get_pals',
        'make_pals',
        'accept_invite',
        'remove_pal',
      ],
      '/api/users': [
        'Checkuser',
        'getFullName',
        'getProfiles',
        'addUser',
        'setName',
        'setSurname',
        'setAvatar',
      ],
    },
  });
});

app.use('/api/location', locationRouter);
app.use('/api/pals', palsRouter);
app.use('/api/users', usersRouter);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `No route for ${req.method} ${req.path}` });
});

// Keeps a malformed JSON body from coming back as Express' default HTML error
// page — every response from this API is JSON. Must stay last, and must keep
// the four arguments, or Express will not treat it as an error handler.
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ ok: false, error: err.message });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

export default app;
