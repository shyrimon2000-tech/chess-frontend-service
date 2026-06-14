# Chess Frontend Service

The browser client for a real-time chess web application built with a microservice architecture.

Vanilla HTML/CSS/JS — no frameworks, no build step. Served as static files by nginx. Local dev via Docker Compose; deployable to Kubernetes.

---

## Features

- Login and registration with JWT-based authentication
- Room list with live room status and player nicknames
- Create a room, quick-join matchmaking, spectate active games
- Real-time chessboard rendered from FEN strings with pixel-art medieval pieces
- Legal move highlighting, last-move highlight, board flip for black player
- WebSocket gameplay with automatic token refresh on expiry
- Disconnect banner with 30-second countdown
- Game-over overlay with winner announcement
- Pawn promotion (auto-queen), castling, en passant
- Auto-redirect back to active game when navigating to rooms while mid-game

---

## Pages

| File | Description |
|---|---|
| `index.html` | Login and register |
| `rooms.html` | Room list, create room, quick join, spectate |
| `game.html` | Chessboard + real-time WebSocket gameplay |

---

## Tech Stack

- HTML5, CSS3, vanilla ES6 JavaScript
- nginx (static serving; non-root, port 8080)
- Docker / Docker Compose (local dev)
- Kubernetes + nginx Ingress (production)
- GitHub Actions CI (build + publish to GHCR on tag)

---

## Project Structure

```text
chess-frontend-service/
├── index.html
├── rooms.html
├── game.html
├── css/
│   └── style.css
├── js/
│   ├── api.js          # fetch + WebSocket wrappers
│   ├── auth.js         # login/register page logic
│   ├── rooms.js        # rooms page logic
│   └── game.js         # board rendering + WS game logic
├── img/
│   ├── chess/          # pixel-art piece images (light_* / dark_*)
│   └── ...             # backgrounds, logo, board
├── nginx.conf          # container config (port 8080, static serving)
├── nginx.dev.conf      # dev reverse-proxy (Docker Compose only)
├── Dockerfile
└── docker-compose.yml
```

---

## Architecture

```text
Browser → nginx Ingress (k8s) / nginx dev proxy → path routing:
  /api/auth/*  → chess-auth-service
  /api/rooms/* → chess-room-service
  /api/game/*  → chess-game-service  (WebSocket upgrade)
  /            → static files (this service)
```

Frontend always calls `/api/...` — never hardcoded ports or service addresses.

---

## Local Dev (Docker Compose)

Sibling repos must be present at `../chess-auth-service`, `../chess-room-service`, `../chess-game-service`.

```bash
docker compose up --build
```

Frontend accessible at `http://localhost:8080`.

---

## CI / CD

GitHub Actions workflow (`.github/workflows/build.yml`):

- **Every push / PR** to `main` or `dev` — trial Docker build (validates the image builds)
- **On semver tag** (e.g. `1.0.0`) — build and push to GitHub Container Registry

Image: `ghcr.io/shyrimon2000-tech/chess-frontend-service:<version>`

---

## Kubernetes

Ingress controller handles all `/api/*` routing to backend services.  
The frontend container only serves static files on port `8080`.

```text
Namespace:         chess
Image:             ghcr.io/shyrimon2000-tech/chess-frontend-service:<version>
Container port:    8080
Ingress:           nginx-ingress
```
