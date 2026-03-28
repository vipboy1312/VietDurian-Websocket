const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());

// Allow requests from your Next.js frontend
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow Postman / server-to-server (no origin) in dev
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// ── Health check (Render pings this to verify the service is up) ──
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vietdurian-websocket' });
});

app.get('/', (_req, res) => {
  res.json({ message: 'VietDurian WebSocket Server' });
});

module.exports = app;
