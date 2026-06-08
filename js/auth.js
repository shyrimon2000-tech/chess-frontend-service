// Redirect if already authenticated
if (localStorage.getItem('access_token')) {
  window.location.href = '/rooms.html';
}

// ── Tab switching ──────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(function(p) {
      p.classList.toggle('active', p.id === 'tab-' + tab);
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = 'msg visible msg-' + type;
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : btn.dataset.label;
}

// ── Login ─────────────────────────────────────────────────────
var loginForm = document.getElementById('login-form');
var loginMsg  = document.getElementById('login-msg');
var loginBtn  = loginForm.querySelector('button[type="submit"]');
loginBtn.dataset.label = loginBtn.textContent;

loginForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  var email    = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;

  if (!email || !password) {
    showMsg(loginMsg, 'Please fill in all fields.', 'error');
    return;
  }

  setLoading(loginBtn, true);
  loginMsg.className = 'msg';

  try {
    await login(email, password);
    window.location.href = '/rooms.html';
  } catch (err) {
    showMsg(loginMsg, err.message || 'Login failed. Check your credentials.', 'error');
    setLoading(loginBtn, false);
  }
});

// ── Register ──────────────────────────────────────────────────
var registerForm = document.getElementById('register-form');
var registerMsg  = document.getElementById('register-msg');
var registerBtn  = registerForm.querySelector('button[type="submit"]');
registerBtn.dataset.label = registerBtn.textContent;

registerForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  var username = document.getElementById('reg-username').value.trim();
  var email    = document.getElementById('reg-email').value.trim();
  var password = document.getElementById('reg-password').value;

  if (!username || !email || !password) {
    showMsg(registerMsg, 'Please fill in all fields.', 'error');
    return;
  }

  setLoading(registerBtn, true);
  registerMsg.className = 'msg';

  try {
    await register(username, email, password);
    showMsg(registerMsg, 'Account created! Logging you in…', 'success');

    await login(email, password);
    window.location.href = '/rooms.html';
  } catch (err) {
    showMsg(registerMsg, err.message || 'Registration failed.', 'error');
    setLoading(registerBtn, false);
  }
});
