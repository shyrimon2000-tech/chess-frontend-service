# chess-frontend-service

Vanilla HTML/CSS/JS frontend for a chess microservices platform.
Served by nginx as static files. Deployed to Kubernetes (minikube locally).

## Project structure

```
chess-frontend/
├── index.html          # login / register
├── rooms.html          # room list, create room, quick join
├── game.html           # chessboard + WebSocket live game
├── css/style.css       # all styles
├── js/
│   ├── api.js          # all fetch + WebSocket wrappers (ALREADY WRITTEN — do not modify)
│   ├── auth.js         # login/register page logic
│   ├── rooms.js        # rooms page logic
│   └── game.js         # board rendering + WS game logic
├── Dockerfile          # nginx static server
└── k8s/
    ├── deployment.yaml
    ├── service.yaml
    └── ingress.yaml
```

## Architecture

Browser → Ingress → path-based routing:
- `/api/auth/*`  → chess-auth-service
- `/api/rooms/*` → chess-room-service
- `/api/game/*`  → chess-game-service (HTTP + WebSocket upgrade)
- `/`            → chess-frontend (nginx, static files)

The frontend always calls `/api/...` — never hardcoded ports.
WebSocket URL: `ws://<host>/api/game/ws/games/{game_id}?token=<jwt>`

## Auth flow

Tokens stored in `localStorage`: `access_token`, `refresh_token`.
`api.js` handles automatic token refresh on 401 via `tryRefresh()`.
On failed refresh → clear tokens → redirect to `index.html`.

Guard all protected pages at top of their JS file:
```js
if (!localStorage.getItem('access_token')) {
  window.location.href = '/index.html';
}
```

## api.js (already complete — do not rewrite)

Auth: `register(username, email, password)`, `login(email, password)`, `logout()`, `getMe()`
Rooms: `listRooms()`, `createRoom()`, `quickJoin()`, `joinRoom(roomId)`, `leaveRoom(roomId)`, `getRoom(roomId)`
Game: `getGame(gameId)`, `makeMove(gameId, move)`, `getLegalMoves(gameId, square)`, `resign(gameId)`
WebSocket: `connectGameWS(gameId, handlers)` — returns `{ sendMove, sendLegalMoves, sendResign, close }`

WS handlers: `onOpen`, `onClose`, `onError`, `onMessage(msg)`
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

## Board rendering

Use FEN string from `game.board_state` to render the board.
Board is an 8×8 HTML grid. Parse FEN position part (before first space).
UCI move format: source+destination squares, e.g. `e2e4`, `g1f3`, `e1g1` (castling).
Highlight selected square and legal move targets on click.
Flip board for black player (when `myColor === 'black'`).

## Navigation flow

```
index.html  →  (login/register success)  →  rooms.html
rooms.html  →  (join/create room, room.game_id set)  →  game.html?game_id=X
game.html   →  (game over / resign)  →  rooms.html
```

Pass `game_id` via URL query param: `game.html?game_id=1`

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
