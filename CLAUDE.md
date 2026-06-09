# chess-frontend-service

Vanilla HTML/CSS/JS frontend for a chess microservices platform.
Served by nginx as static files. Local dev via Docker Compose; also deployable to Kubernetes.

## Project structure

```
chess-frontend-service/
├── index.html          # login / register
├── rooms.html          # room list, create room, quick join
├── game.html           # chessboard + WebSocket live game
├── css/style.css       # all styles
├── js/
│   ├── api.js          # all fetch + WebSocket wrappers
│   ├── auth.js         # login/register page logic
│   ├── rooms.js        # rooms page logic
│   └── game.js         # board rendering + WS game logic
├── docker-compose.yml  # orchestrates all 4 services + Redis + 3 MySQL DBs
├── nginx.dev.conf      # dev nginx: reverse-proxy to services + WS upgrade
├── Dockerfile          # nginx static server
└── k8s/
    ├── deployment.yaml
    ├── service.yaml
    └── ingress.yaml
```

## Local dev

All services start from this directory:
```
docker compose up --build
```
Sibling repos expected at `../chess-auth-service`, `../chess-room-service`, `../chess-game-service`.
Frontend accessible at `http://localhost:8080`.
chess-auth-service uses a ghcr.io image (no local build needed).

## Architecture

```
Browser → nginx (dev: nginx.dev.conf, k8s: Ingress) → path routing:
  /api/auth/*  → chess-auth-service (strips /api)
  /api/rooms/* → chess-room-service (strips /api/rooms)
  /api/game/*  → chess-game-service (strips /api/game, upgrades WS)
  /            → static files
```

Frontend always calls `/api/...` — never hardcoded ports.
WebSocket URL: `ws://<host>/api/game/ws/games/{game_id}?token=<jwt>`

## Redis event flow (cross-service)

`room_events` channel (room-service → game-service):
- `room_created`  → game-service creates game row (status=waiting, white_player_id set, black null)
- `room_activated`→ game-service sets game status=active + black_player_id, broadcasts game_start via WS

`game_events` channel (game-service → room-service):
- `game_created`  → room-service writes game_id onto the room row

No other cross-service events. game-service does NOT re-publish after room_activated.

## Game lifecycle

1. Player A creates room → room-service publishes `room_created` → game-service creates game row (waiting)
2. game-service publishes `game_created` → room-service records `game_id` on room
3. Player A is redirected to `game.html?game_id=X`, opens WS — game still waiting, no broadcast yet
4. Player B joins room → room-service publishes `room_activated` → game-service activates game
5. game-service broadcasts `game_start` to all WS clients for that game_id
6. Both players see the board; Player A (white) moves first

## Auth flow

Tokens stored in `localStorage`: `access_token`, `refresh_token`.
`api.js` handles automatic token refresh on 401 via `tryRefresh()`.
On failed refresh → clear tokens → redirect to `index.html`.
WS close code `4001` = auth failure → `tryRefresh()` then reconnect.

Guard all protected pages at top of their JS file:
```js
if (!localStorage.getItem('access_token')) {
  window.location.href = '/index.html';
}
```

## api.js

Auth: `register(username, email, password)`, `login(email, password)`, `logout()`, `getMe()`
Rooms: `listRooms()`, `createRoom()`, `quickJoin()`, `joinRoom(roomId)`, `leaveRoom(roomId)`, `getRoom(roomId)`
Game: `getGame(gameId)`, `makeMove(gameId, move)`, `getLegalMoves(gameId, square)`, `resign(gameId)`
WebSocket: `connectGameWS(gameId, handlers)` — returns `{ sendMove, sendLegalMoves, sendResign, close }`

WS handlers: `onOpen`, `onClose(e)`, `onError`, `onMessage(msg)`
- `onClose` receives the full CloseEvent — check `e.code === 4001` for auth failure
WS message types from server: `game_start`, `game_state`, `game_over`, `legal_moves`,
`player_disconnected`, `player_reconnected`, `game_abandoned`, `error`

## API reference

### chess-auth-service
```
POST /auth/register    body: { username, email, password }
POST /auth/login       body: { email, password }  → { access_token, refresh_token, token_type }
GET  /auth/me          header: Authorization: Bearer <token>
POST /auth/refresh     body: { refresh_token }     → { access_token, refresh_token, token_type }
POST /auth/logout      body: { refresh_token }
```

### chess-room-service
```
GET  /rooms                     → array of room objects
POST /rooms                     → create room (caller = white_player_id), 201 new / 200 existing
POST /rooms/quick               → join available room or create new one
GET  /rooms/{room_id}           → room object
POST /rooms/{room_id}/join      → { role: "player"|"spectator", status, ... }
POST /rooms/{room_id}/leave     → leave waiting room
DELETE /rooms/{room_id}         → admin only
```
Room object fields: `id, status (waiting|active|finished), white_player_id, black_player_id, game_id, created_at`

### chess-game-service
```
GET  /games/{game_id}                        → game object
POST /games/{game_id}/join                   → game object with status: active
POST /games/{game_id}/move   body: { move }  → game object (UCI format: "e2e4")
GET  /games/{game_id}/legal-moves?square=e2  → { moves: ["e2e3", "e2e4"] }
POST /games/{game_id}/resign                 → game object with status: finished
WS   /ws/games/{game_id}?token=<jwt>
```
Game object fields: `id, room_id, status (active|finished), white_player_id, black_player_id, current_turn (white|black), board_state (FEN), winner, created_at, updated_at`

## WebSocket connection rules (ws.py in game-service)

- Token invalid → close 4001
- `is_player = user_id in (white_player_id, black_player_id)` — spectators connect as null
- Fresh player connection to active game → `broadcast(game_start)` (notifies all, including white waiting)
- Reconnecting player (was marked disconnected) → `send_personal(game_state)` + `broadcast(player_reconnected)`
- Spectator connecting to active game → `send_personal(game_state)`
- Player disconnect from active game → `broadcast(player_disconnected)` + 30s abandon timer
- Player disconnect from waiting game → `broadcast(game_abandoned)` — in practice, game is activated before WS is opened by both players now

## Board rendering

Use FEN string from `game.board_state` to render the board.
Board is an 8×8 HTML grid. Parse FEN position part (before first space).
UCI move format: source+destination squares, e.g. `e2e4`, `g1f3`, `e1g1` (castling).
Pawn promotion always promotes to queen (appends `q` to UCI string).
Highlight selected square and legal move targets on click.
Flip board for black player (`myColor === 'black'`); spectator sees white's perspective.
`data-piece` attribute on each `.sq` element stores the FEN piece char (used by `getPieceAt()`).

## game.js key state

```js
var myUserId    // current user's id (string)
var myColor     // 'white' | 'black' | 'spectator'
var currentTurn // 'white' | 'black'
var gameStatus  // 'active' | 'finished' | 'waiting'
var gameOver    // true once game_over or game_abandoned received
var ws          // handle returned by connectGameWS
```

Guards in `onSquareClick` (in order):
1. `if (gameOver) return;`
2. `if (gameStatus !== 'active') return;`
3. `if (myColor === 'spectator') return;`
4. `if (currentTurn !== myColor) return;`

## Navigation flow

```
index.html  →  (login/register)  →  rooms.html
rooms.html  →  (join/create, room.game_id set)  →  game.html?game_id=X
game.html   →  (game over / resign)  →  rooms.html
```

Pass `game_id` via URL query param: `game.html?game_id=1`

rooms.js polls `getRoom(roomId)` every 2s (with one immediate check) until `game_id` appears.

## Code style

- No frameworks, no build step, pure ES6
- Each .js file is a standalone script (not modules), loaded via `<script src="...">`
- `api.js` must be loaded before auth.js / rooms.js / game.js in HTML
- Keep functions small and readable
- Comments only where logic is non-obvious

## Kubernetes

Local registry: `localhost:5000` or use `eval $(minikube docker-env)` to build directly into minikube.
Image name: `chess-frontend:latest`
Namespace: `chess`
Ingress controller: nginx-ingress (`minikube addons enable ingress`)
Access via: `minikube ip` or `minikube tunnel` + localhost

## Dockerfile target

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

nginx.conf for the container only needs `try_files $uri $uri/ /index.html;`
since k8s Ingress handles `/api/*` proxying.
