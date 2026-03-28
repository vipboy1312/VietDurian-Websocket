const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// ── Room registry: roomId → Set<WebSocket> ──────────────────────────────────
const rooms = new Map();

function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
}

function leaveRoom(roomId, ws) {
  if (!rooms.has(roomId)) return;
  rooms.get(roomId).delete(ws);
  if (rooms.get(roomId).size === 0) rooms.delete(roomId);
}

function broadcastToRoom(roomId, payload, senderWs = null) {
  if (!rooms.has(roomId)) return;
  const msg = JSON.stringify(payload);
  rooms.get(roomId).forEach((client) => {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ── JWT auth helper ─────────────────────────────────────────────────────────
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
const PING_INTERVAL_MS = 30_000;

function startHeartbeat(wss) {
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log(`[WS] Terminating stale connection: ${ws.userId}`);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(interval));
  return interval;
}

// ── Main init ───────────────────────────────────────────────────────────────
function initWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  startHeartbeat(wss);

  wss.on('connection', (ws, req) => {
    // ── Auth via ?token=<jwt> query param ──
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const user = verifyToken(token);

    if (!user) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.userId = user.id || user._id;
    ws.isAlive = true;
    ws.rooms = new Set();

    console.log(`[WS] Connected: userId=${ws.userId}`);

    // Pong resets the heartbeat flag
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // ── Message handler ──
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }

      handleMessage(ws, msg);
    });

    // ── Disconnect cleanup ──
    ws.on('close', () => {
      console.log(`[WS] Disconnected: userId=${ws.userId}`);
      ws.rooms.forEach((roomId) => leaveRoom(roomId, ws));
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error for userId=${ws.userId}:`, err.message);
    });

    // Ack connection
    ws.send(JSON.stringify({ type: 'connected', userId: ws.userId }));
  });

  // Notify clients before instance shuts down
  process.on('SIGTERM', () => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'server_shutdown', message: 'Server restarting, please reconnect' }));
        ws.close(1001, 'Server shutting down');
      }
    });
    wss.close();
  });

  console.log('[WS] WebSocket server initialised at /ws');
  return wss;
}

// ── Message routing ─────────────────────────────────────────────────────────
function handleMessage(ws, msg) {
  const { type, roomId, payload } = msg;

  switch (type) {
    // Client joins a garden/diary room
    case 'join_room': {
      if (!roomId) return sendError(ws, 'roomId required');
      joinRoom(roomId, ws);
      ws.rooms.add(roomId);
      ws.send(JSON.stringify({ type: 'room_joined', roomId }));
      broadcastToRoom(roomId, { type: 'user_joined', roomId, userId: ws.userId }, ws);
      break;
    }

    // Client leaves a room
    case 'leave_room': {
      if (!roomId) return sendError(ws, 'roomId required');
      leaveRoom(roomId, ws);
      ws.rooms.delete(roomId);
      ws.send(JSON.stringify({ type: 'room_left', roomId }));
      broadcastToRoom(roomId, { type: 'user_left', roomId, userId: ws.userId }, ws);
      break;
    }

    // Broadcast a message to all room members
    case 'message': {
      if (!roomId) return sendError(ws, 'roomId required');
      broadcastToRoom(roomId, {
        type: 'message',
        roomId,
        senderId: ws.userId,
        payload,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    // Diary update notifications (e.g. someone edits a diary entry)
    case 'diary_updated': {
      if (!roomId) return sendError(ws, 'roomId required');
      broadcastToRoom(roomId, {
        type: 'diary_updated',
        roomId,
        updatedBy: ws.userId,
        payload,
        timestamp: new Date().toISOString(),
      }, ws);
      break;
    }

    // Garden sensor / IoT data push
    case 'sensor_data': {
      if (!roomId) return sendError(ws, 'roomId required');
      broadcastToRoom(roomId, {
        type: 'sensor_data',
        roomId,
        payload,
        timestamp: new Date().toISOString(),
      }, ws);
      break;
    }

    // Ping/pong for client-side keepalive
    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    }

    default:
      sendError(ws, `Unknown message type: ${type}`);
  }
}

function sendError(ws, message) {
  ws.send(JSON.stringify({ type: 'error', message }));
}

module.exports = { initWebSocket };
