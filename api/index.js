import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import locationRouter from './routes/location.js';
import palsRouter from './routes/pals.js';
import usersRouter from './routes/users.js';

// Repo-root copy of the debug APK (kept out of the web bundle on purpose -
// in public/ it would ride inside every future APK and grow it ~9 MB each
// rebuild). Render clones the whole repo, so ../Weather App.apk resolves
// here in production just like it does locally. The URL stays the hyphenated
// /weather-app.apk so no encoding is ever needed; only the saved filename
// carries the friendly spaced name.
const APK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../Weather App.apk'
);

const app = express();

// CORS: allow every origin, unconditionally. This API has no authenticated
// endpoints (email-keyed lookups behind a weather-app disguise), so an
// origin allowlist only created failure modes - a stale CORS_ORIGINS on
// Render kept blocking the live site even after the code merged defaults.
// cors() with no options echoes Access-Control-Allow-Origin: * for every
// request and preflight, with zero env involved. CORS_ORIGINS is now ignored.
app.use(cors());

app.use(express.json());

// Accept raw binary bodies up to 50MB for the upload proxy
app.use('/api/upload', express.raw({ type: 'application/octet-stream', limit: '50mb' }));

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
      'GET /weather-app.apk': 'debug APK download (attachment)',
      'POST /api/upload': 'file upload proxy (Supabase Storage)',
    },
  });
});

app.use('/api/location', locationRouter);
app.use('/api/pals', palsRouter);
app.use('/api/users', usersRouter);

// Supabase Storage config (read from env, set on Render dashboard)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'recordings';

// Upload proxy: browsers send the raw file here, this endpoint uploads to
// Supabase Storage server-to-server (no CORS issues). Returns the public URL.
app.post('/api/upload', async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ ok: false, error: 'Supabase Storage not configured' });
    }
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ ok: false, error: 'empty body' });
    }
    const filename = req.query.filename || `evidence-${Date.now()}.webm`;
    // Determine content type from filename extension
    const ext = filename.split('.').pop().toLowerCase();
    const contentType = ext === 'mp4' ? 'video/mp4' : ext === 'm4a' ? 'audio/mp4' : 'video/webm';
    // Upload to Supabase Storage via REST API
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${filename}`;
    const resp = await fetch(storageUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',  // overwrite if exists
      },
      body: req.body,
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ ok: false, error: `Supabase upload failed: ${errText}` });
    }
    // Public URL for the uploaded file
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${filename}`;
    res.json({ ok: true, url: publicUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serves the APK for the site's "Download the Weather app" button. The
// attachment disposition makes browsers save it instead of trying to render
// it; sendFile's own error handling covers a missing file.
app.get('/weather-app.apk', (_req, res) => {
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Weather App.apk"');
  res.sendFile(APK_PATH);
});

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
