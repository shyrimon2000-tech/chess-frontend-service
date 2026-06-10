// Guard
if (!localStorage.getItem('access_token')) {
  window.location.href = '/index.html';
}

var refreshInterval = null;
var createdRoomId   = null;
var pollInterval    = null;

// ── Bootstrap ─────────────────────────────────────────────────
(async function init() {
  var me = null;
  try {
    me = await getMe();
    document.getElementById('nav-username').textContent = me.username || me.email;
  } catch (_) {}

  // Redirect back to active game if the player is already in one
  if (me) {
    try {
      var rooms = await listRooms();
      var myId  = String(me.id);
      var active = rooms.find(function(r) {
        return r.game_id && r.status === 'active' &&
               (String(r.white_player_id) === myId || String(r.black_player_id) === myId);
      });
      if (active) {
        goToGame(active.game_id);
        return;
      }
    } catch (_) {}
  }

  await loadRooms();
  refreshInterval = setInterval(loadRooms, 5000);
})();

// ── Helpers ───────────────────────────────────────────────────
function showActionMsg(text, type) {
  var el = document.getElementById('action-msg');
  el.textContent = text;
  el.className = 'msg visible msg-' + (type || 'error');
}

function clearActionMsg() {
  var el = document.getElementById('action-msg');
  el.className = 'msg';
}

function goToGame(gameId) {
  clearInterval(refreshInterval);
  clearInterval(pollInterval);
  window.location.href = '/game.html?game_id=' + gameId;
}

// ── Room list ─────────────────────────────────────────────────
async function loadRooms() {
  try {
    var rooms = await listRooms();
    renderRooms(rooms);
  } catch (err) {
    // silently ignore transient fetch errors on auto-refresh
  }
}

function renderRooms(rooms) {
  var tbody = document.getElementById('rooms-tbody');

  if (!rooms || rooms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted text-center">No rooms yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rooms.map(function(room) {
    var date    = new Date(room.created_at).toLocaleTimeString();
    var badge   = '<span class="status-badge status-' + room.status + '">' + room.status + '</span>';
    var joinBtn = '';

    if (room.status === 'waiting') {
      joinBtn = '<button class="btn btn-primary btn-sm join-btn" data-room-id="' + room.id + '">Join</button>';
    } else if (room.status === 'active' && room.game_id) {
      joinBtn = '<button class="btn btn-secondary btn-sm spectate-btn" data-game-id="' + room.game_id + '">Spectate</button>';
    }

    return '<tr>' +
      '<td class="text-muted">#' + room.id + '</td>' +
      '<td>' + (room.white_player_nickname || '—') + '</td>' +
      '<td>' + (room.black_player_nickname || '—') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td class="text-muted">' + date + '</td>' +
      '<td>' + joinBtn + '</td>' +
    '</tr>';
  }).join('');

  // Attach join handlers
  tbody.querySelectorAll('.join-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      handleJoin(btn.dataset.roomId);
    });
  });

  tbody.querySelectorAll('.spectate-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      goToGame(btn.dataset.gameId);
    });
  });
}

// ── Join room ─────────────────────────────────────────────────
async function handleJoin(roomId) {
  clearActionMsg();
  var btn = document.querySelector('.join-btn[data-room-id="' + roomId + '"]');
  if (btn) btn.disabled = true;
  try {
    var result = await joinRoom(roomId);

    if (result.game_id) {
      goToGame(result.game_id);
      return;
    }

    // Room became active but game_id not returned yet — poll the room
    pollForGame(roomId);
  } catch (err) {
    showActionMsg(err.message || 'Failed to join room.', 'error');
    if (btn) btn.disabled = false;
  }
}

// ── Quick join ────────────────────────────────────────────────
document.getElementById('quick-join-btn').addEventListener('click', async function() {
  clearActionMsg();
  var btn = this;
  btn.disabled = true;

  try {
    var room = await quickJoin();

    if (room.game_id) {
      goToGame(room.game_id);
      return;
    }

    // We created a new room waiting for opponent
    showCreatedRoom(room.id);
  } catch (err) {
    showActionMsg(err.message || 'Quick join failed.', 'error');
    btn.disabled = false;
  }
});

// ── Create room ───────────────────────────────────────────────
document.getElementById('create-room-btn').addEventListener('click', async function() {
  clearActionMsg();
  var btn = this;
  btn.disabled = true;

  try {
    var room = await createRoom();

    if (room.game_id) {
      goToGame(room.game_id);
      return;
    }

    showCreatedRoom(room.id);
  } catch (err) {
    showActionMsg(err.message || 'Failed to create room.', 'error');
    btn.disabled = false;
  }
});

function showCreatedRoom(roomId) {
  createdRoomId = roomId;
  var panel = document.getElementById('create-room-info');
  panel.classList.remove('hidden');
  document.getElementById('created-room-id').textContent = 'Room #' + roomId + ' — share this ID with your opponent.';

  var msg = document.getElementById('create-room-msg');
  msg.textContent = 'Waiting for an opponent to join…';
  msg.className = 'msg visible msg-info';

  pollForGame(roomId);
}

// ── Poll room until game_id appears ───────────────────────────
function pollForGame(roomId) {
  clearInterval(pollInterval);
  var errorCount = 0;
  async function check() {
    try {
      var room = await getRoom(roomId);
      errorCount = 0;
      if (room.game_id) {
        clearInterval(pollInterval);
        goToGame(room.game_id);
      }
    } catch (_) {
      errorCount++;
      if (errorCount >= 3) {
        clearInterval(pollInterval);
        showActionMsg('Room no longer available.', 'error');
      }
    }
  }
  check();
  pollInterval = setInterval(check, 300);
}

// ── Logout ────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async function() {
  clearInterval(refreshInterval);
  clearInterval(pollInterval);
  try { await logout(); } catch (_) {}
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  window.location.href = '/index.html';
});
