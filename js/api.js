const API = {
  AUTH:  '/api',
  ROOMS: '/api/rooms',
  GAME:  '/api/game',
};

// ---------- token helpers ----------

function getToken() {
  return localStorage.getItem('access_token');
}

function saveTokens(access, refresh) {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

// ---------- core fetch with auto-refresh ----------

async function request(url, options = {}, retry = true) {
  const res = await fetch(url, options);

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      options.headers = { ...options.headers, 'Authorization': `Bearer ${getToken()}` };
      return request(url, options, false);
    } else {
      clearTokens();
      window.location.href = '/index.html';
      return;
    }
  }

  return res;
}

async function tryRefresh() {
  const rt = localStorage.getItem('refresh_token');
  if (!rt) return false;
  try {
    const res = await fetch(`${API.AUTH}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ---------- auth service ----------

async function register(username, email, password) {
  const res = await fetch(`${API.AUTH}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Registration failed');
  return data;
}

async function login(email, password) {
  const res = await fetch(`${API.AUTH}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  saveTokens(data.access_token, data.refresh_token);
  return data;
}

async function logout() {
  const rt = localStorage.getItem('refresh_token');
  if (rt) {
    await request(`${API.AUTH}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: rt }),
    });
  }
  clearTokens();
}

async function getMe() {
  const res = await request(`${API.AUTH}/auth/me`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to get user');
  return data;
}

// ---------- room service ----------

async function listRooms() {
  const res = await request(`${API.ROOMS}/rooms`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to list rooms');
  return data;
}

async function createRoom() {
  const res = await request(`${API.ROOMS}/rooms`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to create room');
  return data;
}

async function quickJoin() {
  const res = await request(`${API.ROOMS}/rooms/quick`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Quick join failed');
  return data;
}

async function joinRoom(roomId) {
  const res = await request(`${API.ROOMS}/rooms/${roomId}/join`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Join failed');
  return data;
}

async function leaveRoom(roomId) {
  const res = await request(`${API.ROOMS}/rooms/${roomId}/leave`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Leave failed');
  return data;
}

async function getRoom(roomId) {
  const res = await request(`${API.ROOMS}/rooms/${roomId}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to get room');
  return data;
}

// ---------- game service ----------

async function getGame(gameId) {
  const res = await request(`${API.GAME}/games/${gameId}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to get game');
  return data;
}

async function makeMove(gameId, move) {
  const res = await request(`${API.GAME}/games/${gameId}/move`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ move }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Move failed');
  return data;
}

async function getLegalMoves(gameId, square) {
  const res = await request(
    `${API.GAME}/games/${gameId}/legal-moves?square=${square}`,
    { headers: authHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to get legal moves');
  return data.moves;
}

async function resign(gameId) {
  const res = await request(`${API.GAME}/games/${gameId}/resign`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Resign failed');
  return data;
}

// ---------- game WebSocket ----------

function connectGameWS(gameId, handlers) {
  const token = getToken();
  // WS goes directly to game-service; ingress must support ws:// upgrade on /api/game/ws/*
  const wsBase = window.location.origin.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/api/game/ws/games/${gameId}?token=${token}`);

  ws.onopen    = () => handlers.onOpen?.();
  ws.onclose   = () => handlers.onClose?.();
  ws.onerror   = (e) => handlers.onError?.(e);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handlers.onMessage?.(msg);
    } catch {
      console.error('WS parse error', e.data);
    }
  };

  return {
    sendMove:        (move)   => ws.send(JSON.stringify({ type: 'move', move })),
    sendLegalMoves:  (square) => ws.send(JSON.stringify({ type: 'legal_moves', square })),
    sendResign:      ()       => ws.send(JSON.stringify({ type: 'resign' })),
    close:           ()       => ws.close(),
  };
}
