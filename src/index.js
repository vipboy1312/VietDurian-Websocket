require('dotenv').config();
const { createServer } = require('http');
const app = require('./app');
const { initWebSocket } = require('./websocket');

const PORT = process.env.PORT || 10000;

const server = createServer(app);

// Attach WebSocket to the HTTP server
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`[VietDurian WS] Server running on port ${PORT}`);
});

// ── Graceful shutdown (Render sends SIGTERM before replacing instance) ──
process.on('SIGTERM', () => {
  console.log('[VietDurian WS] SIGTERM received – shutting down gracefully...');
  server.close(() => {
    console.log('[VietDurian WS] HTTP server closed');
    process.exit(0);
  });

  // Force-exit after 25s (Render gives 30s)
  setTimeout(() => {
    console.error('[VietDurian WS] Force exit after timeout');
    process.exit(1);
  }, 25_000);
});
