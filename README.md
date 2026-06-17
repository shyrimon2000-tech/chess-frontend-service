# Chess Frontend Service

> **This service is complete.** All planned features are implemented, tested end-to-end, and the CI/CD pipeline is fully operational.

The browser client for a real-time chess web application built with a microservice architecture.

Vanilla HTML/CSS/JS — no frameworks, no build step. Served as static files by nginx. Local dev via Docker Compose; deployable to Kubernetes.

---

## Badges

Dev: [![CI Dev](https://github.com/shyrimon2000-tech/chess-frontend-service/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/shyrimon2000-tech/chess-frontend-service/actions)

Pull Request: [![CI PR](https://github.com/shyrimon2000-tech/chess-frontend-service/actions/workflows/ci.yml/badge.svg?event=pull_request)](https://github.com/shyrimon2000-tech/chess-frontend-service/actions)

---

## Features

- Login and registration with JWT-based authentication
- Room list with live room status and player nicknames
- Create a room, quick-join matchmaking, spectate active games
- Real-time chessboard rendered from FEN strings with pixel-art medieval pieces
- Legal move highlighting, last-move highlight, board flip for black player
- WebSocket gameplay with automatic token refresh on expiry
- Disconnect banner with 30-second countdown timer
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
- Docker / Docker Compose
- Kubernetes + nginx Ingress (production)
- GitHub Actions CI (build + E2E + publish to GHCR on tag)
- Playwright + pytest (E2E test suite)

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
│   ├── api.js              # fetch + WebSocket wrappers
│   ├── auth.js             # login/register page logic
│   ├── rooms.js            # rooms page logic
│   └── game.js             # board rendering + WS game logic
├── img/
│   ├── chess/              # pixel-art piece images (light_* / dark_*)
│   └── ...                 # backgrounds, logo, board
├── e2e_tests/              # Playwright E2E test suite (34 tests)
│   ├── chess_test*.py
│   ├── helpers.py
│   └── cleanup.py
├── nginx.conf              # container config (port 8080, static serving)
├── nginx.dev.conf          # dev reverse-proxy (Docker Compose only)
├── docker-compose.e2e.yml  # full stack for E2E runs
├── .env.e2e                # E2E environment variables
├── e2e_versions.env        # backend service image versions for E2E
├── pytest-e2e.ini          # pytest config for E2E suite
├── requirements-e2e.txt    # Python dependencies for E2E
└── Dockerfile
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

## E2E Tests

The suite covers 34 tests across 9 scenarios using Playwright + pytest against a fully containerised stack.

| File | Scenarios |
|---|---|
| `chess_test1.py` | T1–T4: Full resign game — two players, game start, resign, banners |
| `chess_test2.py` | T5–T8: Disconnect and reconnect within 30 s — banner shown then hidden |
| `chess_test3.py` | T9–T12: Disconnect timeout — game abandoned, room deleted |
| `chess_test4.py` | T13–T16: Resign button visibility, resign flow, redirect, room cleanup |
| `chess_test5.py` | T17–T20: Quick join and explicit join — matchmaking, game start |
| `chess_test6.py` | T21–T23: Auth flows — unauth redirect, bad credentials, logout |
| `chess_test7.py` | T24–T27: Spectator — sees board from white's perspective, cannot act |
| `chess_test8.py` | T28–T31: Board interaction — legal move highlights, turn guard, move execution |
| `chess_test9.py` | T32–T34: Return-to-game panel — navigation away shows panel instead of auto-redirect |

To run locally:

```bash
# Build frontend image first
docker build -t chess-frontend-service .

# Combine env files
cat .env.e2e e2e_versions.env > .env.combined

# Start full stack
docker compose -f docker-compose.e2e.yml --env-file .env.combined up -d --wait

# Run tests
pip install -r requirements-e2e.txt
playwright install chromium --with-deps
python -m pytest -c pytest-e2e.ini -v

# Tear down
docker compose -f docker-compose.e2e.yml --env-file .env.combined down
```

---

## CI / CD

GitHub Actions workflow (`.github/workflows/ci.yml`):

| Job | Trigger | Description |
|---|---|---|
| `docker-build` | Every push to `dev`, PR to `main`, tag | Builds Docker image and saves as artifact |
| `e2e` | PR to `main`, semver tag, manual | Spins up full stack, runs all 34 E2E tests |
| `publish` | Semver tag (e.g. `1.0.0`) | Pushes image to GitHub Container Registry |

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
