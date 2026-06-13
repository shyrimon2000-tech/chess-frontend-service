# Chess Frontend Service

The browser client for a real-time chess web application built with a microservice architecture.

Vanilla HTML/CSS/JS — no frameworks, no build step. Served as static files by nginx. Local dev via Docker Compose; deployable to Kubernetes.

---

## Features

- Login and registration with JWT-based authentication
- Room list with live room status and player nicknames
- Create a room, quick-join matchmaking, spectate active games
- Real-time chessboard rendered from FEN strings
- Legal move highlighting, board flip for black player
- WebSocket gameplay with automatic token refresh on expiry
- Disconnect banner with 30-second countdown
- Game-over overlay with winner announcement
- Pawn promotion (auto-queen), castling, en passant
- Player nicknames displayed in the players bar
- Auto-redirect back to active game when navigating to rooms.html mid-game

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
- nginx (static serving + reverse proxy in dev)
- Docker / Docker Compose
- Playwright (end-to-end tests)

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
│   ├── api.js          # all fetch + WebSocket wrappers
│   ├── auth.js         # login/register page logic
│   ├── rooms.js        # rooms page logic
│   └── game.js         # board rendering + WS game logic
├── tests/
│   ├── helpers.py      # shared reg() helper with rate-limit window tracking
│   ├── chess_test.py   # T1–T6
│   ├── chess_test2.py  # T7–T10
│   ├── chess_test3.py  # T11–T14
│   ├── chess_test4.py  # T15–T16
│   ├── chess_test5.py  # T17–T20
│   ├── chess_test6.py  # T21–T23
│   ├── chess_test7.py  # T24–T25
│   ├── chess_test8.py  # T26–T31
│   └── chess_test9.py  # T32–T34
└── nginx.dev.conf      # dev reverse-proxy config
```

---

## Architecture

```text
Browser → nginx → path routing:
  /api/auth/*  → chess-auth-service  (strips /api)
  /api/rooms/* → chess-room-service  (strips /api/rooms)
  /api/game/*  → chess-game-service  (strips /api/game, upgrades WS)
  /            → static files
```

Frontend always calls `/api/...` — never hardcoded ports.

---

## Run with Docker Compose

Start all services from this directory:

```bash
docker compose up --build
```

Sibling repos must be present at `../chess-auth-service`, `../chess-room-service`, `../chess-game-service`.

Frontend is accessible at:

```text
http://localhost:8080
```

---

## End-to-End Tests

Tests use Playwright (Python). The full stack must be running before executing tests.

Install dependencies:

```bash
pip install playwright pytest-playwright
playwright install chromium
```

Run a specific test file:

```bash
cd tests
python chess_test.py
```

Test coverage (T1–T34):

| Test | Description |
|---|---|
| T1 | Room creation redirect speed |
| T2 | Black player joins — game_start not game_abandoned |
| T3 | Board orientation (white/black flip) |
| T4 | Resign button visible for players |
| T5 | Move blocking (wrong turn) |
| T6 | Spectator view |
| T7 | White makes a move |
| T8 | White blocked on black's turn |
| T9 | Black makes a move |
| T10 | Resign — game over banner |
| T11 | Back to rooms after resign |
| T12 | Disconnect banner on opponent leave |
| T13 | Reconnect hides disconnect banner |
| T14 | Last-move highlight |
| T15 | Checkmate (Fool's Mate) |
| T16 | Quick join matchmaking |
| T17 | Creator leaves waiting room — room deleted |
| T18 | Abandon timeout after 30s disconnect |
| T19 | Pawn promotion (auto-queen) |
| T20 | King-side castling |
| T21 | Simultaneous join race condition |
| T22 | Spectator sees current board state mid-game |
| T23 | Page refresh — reconnect keeps board state |
| T24 | En passant |
| T25 | Queenside castling |
| T26 | Rooms table shows white player nickname |
| T27 | Rooms table shows both nicknames after black joins |
| T28 | Players bar shows both nicknames after game start |
| T29 | Active card highlights on current turn |
| T30 | Spectator sees both nicknames |
| T31 | Nicknames restored after page refresh |
| T32 | rooms.html auto-redirects to active game |
| T33 | Intentional leave shows return-to-game panel |
| T34 | Return button redirects back to active game |

---

## Kubernetes

Local registry: `localhost:5000` or `eval $(minikube docker-env)`.

Image name: `chess-frontend:latest`  
Namespace: `chess`  
Ingress controller: nginx-ingress (`minikube addons enable ingress`)  
Access via: `minikube ip` or `minikube tunnel` + localhost
