// Guard
if (!localStorage.getItem('access_token')) {
  window.location.href = '/index.html';
}

// ── Constants ─────────────────────────────────────────────────
var PIECE_UNICODE = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

// ── State ─────────────────────────────────────────────────────
var gameId      = new URLSearchParams(location.search).get('game_id');
var myUserId    = null;
var myColor     = null;
var currentTurn = null;
var gameStatus  = null;
var gameOver    = false;
var selectedSq  = null;
var legalMoves  = [];   // array of UCI strings e.g. ["e2e3","e2e4"]
var ws          = null;
var lastMoveSrc = null;
var lastMoveDst = null;
var disconnectTimer  = null;
var reconnectTimer   = null;
var reconnectAttempts = 0;
var MAX_RECONNECT     = 10;

// ── Init ──────────────────────────────────────────────────────
(async function init() {
  if (!gameId) {
    window.location.href = '/rooms.html';
    return;
  }

  try {
    var me = await getMe();
    myUserId = me.id || me.user_id || me.sub || me.username;
    document.getElementById('nav-username').textContent = me.username || me.email;
  } catch (_) {
    window.location.href = '/index.html';
    return;
  }

  try {
    var game = await getGame(gameId);
    applyGameState(game);
  } catch (err) {
    showGameMsg((err.message || 'Failed to load game') + ' — redirecting to rooms…', 'error');
    setTimeout(function() { window.location.href = '/rooms.html'; }, 3000);
    return;
  }

  connectWS();
})();

// ── WebSocket ─────────────────────────────────────────────────
function connectWS() {
  clearTimeout(reconnectTimer);
  ws = connectGameWS(gameId, {
    onOpen: function() {
      reconnectAttempts = 0;
      clearGameMsg();
    },
    onClose: function(e) {
      if (gameOver) return;
      reconnectAttempts++;
      if (reconnectAttempts > MAX_RECONNECT) {
        showGameMsg('Game no longer available. Redirecting to rooms…', 'error');
        setTimeout(function() { window.location.href = '/rooms.html'; }, 3000);
        return;
      }
      showGameMsg('Connection lost. Reconnecting… (' + reconnectAttempts + '/' + MAX_RECONNECT + ')', 'error');
      reconnectTimer = setTimeout(function() {
        if (e && e.code === 4001) {
          tryRefresh().finally(connectWS);
        } else {
          connectWS();
        }
      }, 3000);
    },
    onError:   function() {},
    onMessage: handleWsMessage
  });
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'game_start':
      applyGameState(msg.game || msg);
      clearSelection();
      break;

    case 'game_state':
      if (msg.last_move) {
        lastMoveSrc = msg.last_move.slice(0, 2);
        lastMoveDst = msg.last_move.slice(2, 4);
      }
      applyGameState(msg.game || msg);
      clearSelection();
      break;

    case 'game_over':
      if (msg.last_move) {
        lastMoveSrc = msg.last_move.slice(0, 2);
        lastMoveDst = msg.last_move.slice(2, 4);
      }
      applyGameState(msg.game || msg);
      break;

    case 'legal_moves':
      legalMoves = msg.moves || [];
      highlightLegal();
      break;

    case 'player_disconnected':
      showDisconnectBanner(msg.timeout_seconds || 30);
      break;

    case 'player_reconnected':
      hideDisconnectBanner();
      break;

    case 'game_abandoned':
      hideDisconnectBanner();
      showBanner('game-over-banner', 'Game abandoned', 'Opponent left the game.', 'winner-draw');
      gameOver = true;
      document.getElementById('resign-btn').disabled = true;
      break;

    case 'error':
      showGameMsg(msg.message || msg.detail || 'Unknown error.', 'error');
      break;
  }
}

// ── Game state ────────────────────────────────────────────────
function applyGameState(game) {
  if (!game) return;

  // Determine color once
  if ((!myColor || myColor === 'spectator') && myUserId !== null) {
    if (String(game.white_player_id) === String(myUserId)) {
      myColor = 'white';
    } else if (String(game.black_player_id) === String(myUserId)) {
      myColor = 'black';
    } else {
      myColor = 'spectator';
    }
    document.getElementById('my-color').textContent = myColor;
    if (myColor === 'spectator') {
      document.getElementById('resign-btn').style.display = 'none';
    }
  }

  gameStatus  = game.status || null;
  currentTurn = game.current_turn || 'white';
  var turnEl = document.getElementById('current-turn');
  turnEl.textContent = currentTurn.charAt(0).toUpperCase() + currentTurn.slice(1);
  turnEl.className = 'value turn-' + currentTurn;

  document.getElementById('game-status').textContent = game.status || '—';

  if (game.board_state) {
    renderBoard(game.board_state);
  }

  if (game.status === 'finished') {
    showGameOver(game);
  }
}

// ── Board rendering ───────────────────────────────────────────
function renderBoard(fen) {
  var board  = document.getElementById('chessboard');
  var ranks  = parseFen(fen);          // ranks[0] = rank 8 … ranks[7] = rank 1
  var flip   = myColor === 'black';

  board.innerHTML = '';

  // When flipped: render rank 1 first (top), a-file on right
  var rankOrder = flip
    ? [7, 6, 5, 4, 3, 2, 1, 0]   // rank 1 … rank 8
    : [0, 1, 2, 3, 4, 5, 6, 7];  // rank 8 … rank 1

  var fileOrder = flip
    ? [7, 6, 5, 4, 3, 2, 1, 0]   // h … a
    : [0, 1, 2, 3, 4, 5, 6, 7];  // a … h

  rankOrder.forEach(function(ri) {
    fileOrder.forEach(function(fi) {
      var rankNum = 8 - ri;        // actual rank number (1-8)
      var fileChar = String.fromCharCode(97 + fi); // a-h
      var sqName = fileChar + rankNum;
      var piece  = ranks[ri][fi];

      var sq = document.createElement('div');
      sq.className = 'sq ' + ((ri + fi) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.sq    = sqName;
      sq.dataset.piece = piece || '';

      if (piece) {
        sq.innerHTML = '<span class="piece">' + (PIECE_UNICODE[piece] || piece) + '</span>';
        sq.classList.add('has-piece');
      }

      if (sqName === lastMoveSrc || sqName === lastMoveDst) {
        sq.classList.add('last-move');
      }

      sq.addEventListener('click', function() { onSquareClick(sqName); });
      board.appendChild(sq);
    });
  });

  // Re-apply selection and legal highlights after redraw
  if (selectedSq) highlightSelected();
  if (legalMoves.length) highlightLegal();

  renderCoords(flip);
}

// Parse FEN position into 8×8 array (ranks[0]=rank8, ranks[7]=rank1)
function parseFen(fen) {
  var position = fen.split(' ')[0];
  var rows = position.split('/');
  return rows.map(function(row) {
    var cells = [];
    for (var i = 0; i < row.length; i++) {
      var ch = row[i];
      if (ch >= '1' && ch <= '8') {
        for (var n = 0; n < parseInt(ch); n++) cells.push(null);
      } else {
        cells.push(ch);
      }
    }
    return cells;
  });
}

function renderCoords(flip) {
  var board = document.getElementById('chessboard');
  var files = flip
    ? ['h','g','f','e','d','c','b','a']
    : ['a','b','c','d','e','f','g','h'];

  // Inject rank labels as overlays on first square of each row
  var squares = board.querySelectorAll('.sq');
  for (var i = 0; i < 8; i++) {
    var rankLabel = document.createElement('span');
    rankLabel.style.cssText = 'position:absolute;top:2px;left:3px;font-size:10px;color:rgba(0,0,0,0.4);pointer-events:none;user-select:none;';
    rankLabel.textContent = flip ? (i + 1) : (8 - i);
    squares[i * 8].appendChild(rankLabel);
  }

  // File labels on last row squares
  for (var j = 0; j < 8; j++) {
    var fileLabel = document.createElement('span');
    fileLabel.style.cssText = 'position:absolute;bottom:2px;right:3px;font-size:10px;color:rgba(0,0,0,0.4);pointer-events:none;user-select:none;';
    fileLabel.textContent = files[j];
    squares[56 + j].appendChild(fileLabel);
  }
}

// ── Click / move logic ────────────────────────────────────────
function onSquareClick(sqName) {
  if (gameOver) return;
  if (gameStatus !== 'active') return;
  if (myColor === 'spectator') return;
  if (currentTurn !== myColor) return;

  // If a square is already selected and user clicks a legal target → move
  if (selectedSq && legalMoves.some(function(m) { return m.slice(2, 4) === sqName && m.slice(0, 2) === selectedSq; })) {
    var move = selectedSq + sqName;
    // Handle pawn promotion — always promote to queen
    var destRank = sqName[1];
    var srcPiece = getPieceAt(selectedSq);
    if (srcPiece && srcPiece.toLowerCase() === 'p' && (destRank === '8' || destRank === '1')) {
      move += 'q';
    }

    lastMoveSrc = selectedSq;
    lastMoveDst = sqName;
    clearSelection();

    ws.sendMove(move);
    return;
  }

  // Select own piece
  clearSelection();
  var piece = getPieceAt(sqName);
  if (!piece) return;
  if (!isMyPiece(piece)) return;

  selectedSq = sqName;
  highlightSelected();
  ws.sendLegalMoves(sqName);
}

function getPieceAt(sqName) {
  var sq = document.querySelector('[data-sq="' + sqName + '"]');
  return sq ? (sq.dataset.piece || null) : null;
}

function isMyPiece(piece) {
  if (myColor === 'spectator') return false;
  if (myColor === 'white') return piece >= 'A' && piece <= 'Z';
  return piece >= 'a' && piece <= 'z';
}

function clearSelection() {
  selectedSq = null;
  legalMoves = [];
  document.querySelectorAll('.sq.selected, .sq.legal-target').forEach(function(el) {
    el.classList.remove('selected', 'legal-target');
  });
}

function highlightSelected() {
  if (!selectedSq) return;
  var el = document.querySelector('[data-sq="' + selectedSq + '"]');
  if (el) el.classList.add('selected');
}

function highlightLegal() {
  legalMoves.forEach(function(uci) {
    var dst = uci.slice(2, 4);
    var el  = document.querySelector('[data-sq="' + dst + '"]');
    if (el) el.classList.add('legal-target');
  });
}


// ── Game over ─────────────────────────────────────────────────
function showGameOver(game) {
  gameOver = true;
  document.getElementById('resign-btn').disabled = true;
  clearSelection();

  var winner = game.winner;
  var title, sub, cls;

  if (!winner || winner === 'draw') {
    title = 'Draw!';
    sub   = 'The game ended in a draw.';
    cls   = 'winner-draw';
  } else if (winner === myColor) {
    title = 'You win!';
    sub   = 'Congratulations!';
    cls   = 'winner-' + winner;
  } else {
    title = 'You lose.';
    sub   = (winner.charAt(0).toUpperCase() + winner.slice(1)) + ' wins.';
    cls   = 'winner-' + winner;
  }

  showBanner('game-over-banner', title, sub, cls);
}

function showBanner(id, title, sub, cls) {
  var banner = document.getElementById(id);
  if (title !== undefined) {
    var h3 = banner.querySelector('h3');
    var p  = banner.querySelector('p');
    if (h3) h3.textContent = title;
    if (p)  p.textContent  = sub || '';
  }
  banner.className = 'banner visible' + (cls ? ' ' + cls : '');
}

// ── Disconnect banner ─────────────────────────────────────────
function showDisconnectBanner(seconds) {
  clearTimeout(disconnectTimer);
  var banner   = document.getElementById('disconnect-banner');
  var countdown = document.getElementById('disconnect-countdown');
  banner.className = 'banner visible';

  var remaining = seconds;
  function tick() {
    countdown.textContent = 'Game will be abandoned in ' + remaining + 's…';
    if (remaining <= 0) return;
    remaining--;
    disconnectTimer = setTimeout(tick, 1000);
  }
  tick();
}

function hideDisconnectBanner() {
  clearTimeout(disconnectTimer);
  document.getElementById('disconnect-banner').className = 'banner';
}

// ── Resign ────────────────────────────────────────────────────
document.getElementById('resign-btn').addEventListener('click', function() {
  if (gameOver || !ws) return;
  if (!confirm('Are you sure you want to resign?')) return;
  ws.sendResign();
});

// ── Inline message ────────────────────────────────────────────
function showGameMsg(text, type) {
  var el = document.getElementById('game-msg');
  el.textContent = text;
  el.className = 'msg visible msg-' + (type || 'error');
}

function clearGameMsg() {
  document.getElementById('game-msg').className = 'msg';
}
