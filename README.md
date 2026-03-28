# vietdurian-websocket

Real-time WebSocket server for the VietDurian platform, hosted on Render.

## Stack
- **Node.js** + **Express** (HTTP layer / health check)
- **ws** (WebSocket server)
- **jsonwebtoken** (auth)

## Local development

```bash
npm install
cp .env.example .env   # fill in JWT_SECRET
npm run dev
```

Connect via `ws://localhost:10000/ws?token=<jwt>`

## Render deployment

1. Push to GitHub
2. In Render: **New → Web Service** → connect your repo
3. Or use **Blueprints** with the included `render.yaml`
4. Set env vars in the Render dashboard:
   - `JWT_SECRET` — must match your Express backend's JWT secret
   - `ALLOWED_ORIGINS` — e.g. `https://vietdurian.vercel.app`

> ⚠️ Always use `wss://` (not `ws://`) for public internet connections.

## WebSocket Message Protocol

All messages are JSON. Connect with:
```
wss://vietdurian-websocket.onrender.com/ws?token=<jwt>
```

### Client → Server

| type | fields | description |
|------|--------|-------------|
| `join_room` | `roomId` | Join a garden/diary room |
| `leave_room` | `roomId` | Leave a room |
| `message` | `roomId`, `payload` | Send message to room |
| `diary_updated` | `roomId`, `payload` | Notify room of diary change |
| `sensor_data` | `roomId`, `payload` | Push IoT/sensor data |
| `ping` | — | Client keepalive |

### Server → Client

| type | description |
|------|-------------|
| `connected` | Auth success, includes `userId` |
| `room_joined` | Confirmed room join |
| `room_left` | Confirmed room leave |
| `user_joined` | Another user joined the room |
| `user_left` | Another user left the room |
| `message` | Incoming room message |
| `diary_updated` | Diary entry changed |
| `sensor_data` | Incoming sensor data |
| `pong` | Response to `ping` |
| `server_shutdown` | Graceful shutdown notice — reconnect |
| `error` | Error details |

## Frontend usage (Next.js)

```js
const ws = new WebSocket(
  `wss://vietdurian-websocket.onrender.com/ws?token=${authToken}`
)

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'join_room', roomId: gardenId }))
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.type === 'diary_updated') {
    // refresh diary list
  }
}
```

## Room naming convention

| Purpose | roomId format |
|---------|--------------|
| Garden chat | `garden:<gardenId>` |
| Season diary | `diary:<diaryId>` |
| Admin dashboard | `admin:<orgId>` |
