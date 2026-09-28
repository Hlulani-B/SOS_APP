import express from 'express';
import cors from 'cors';
import locationRouter from './routes/location.js';
import palsRouter from './routes/pals.js';
import usersRouter from './routes/users.js';

const app = express();

// CORS: allow every origin, unconditionally. This API has no authenticated
// endpoints (email-keyed lookups behind a weather-app disguise), so an
// origin allowlist only created failure modes - a stale CORS_ORIGINS on
// Render kept blocking the live site even after the code merged defaults.
// cors() with no options echoes Access-Control-Allow-Origin: * for every
// request and preflight, with zero env involved. CORS_ORIGINS is now ignored.
app.use(cors());

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    // Deploy fingerprint: presence of this key proves the wildcard-CORS
    // build is live; remove only once every client has been verified.
    cors: 'wildcard',
    routes: {
      '/api/location': ['addEmail', 'ShareLocation', 'StopLiveLocation', 'getLocationsByEmails'],
      '/api/pals': [
        'send_invite',
        'get_invites',
        'get_sent_invites',
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
