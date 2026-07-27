/**
 * auth.js - manages the current session, the login/register modal,
 * and the user-menu dropdown that appears in the nav once logged in.
 * Include this on every page (index, dashboard, admin).
 */
const Auth = (() => {
  let currentUser = null;

  async function loadSession() {
    try {
      const { user } = await API.me();
      currentUser = user;
    } catch (_) {
      currentUser = null;
    }
    return currentUser;
  }

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return !!currentUser;
  }

  function isAdmin() {
    return currentUser?.role === 'admin';
  }

  function initials(name) {
    return (name || '?').slice(0, 2).toUpperCase();
  }

  function buildModal() {
    if (document.getElementById('authModalOverlay')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'authModalOverlay';
    wrapper.className = 'modal-overlay';
    wrapper.innerHTML = `
      <div class="auth-modal">
        <button class="modal-close" id="authModalClose"><i class="fas fa-times"></i></button>
        <div class="auth-modal-icon"><i class="fas fa-robot"></i></div>
        <div class="auth-tabs">
          <div class="auth-tab-indicator" id="authTabIndicator"></div>
          <div class="auth-tab active" data-tab="login">Login</div>
          <div class="auth-tab" data-tab="register">Register</div>
        </div>

        <div id="loginPane" class="auth-pane active">
          <h2>Welcome back</h2>
          <p class="auth-sub">Log in to access AI Chat, Image Gen and your saved history.</p>
          <div class="auth-error" id="loginError"></div>
          <form class="auth-form" id="loginForm">
            <div class="form-group">
              <label>Email or Username</label>
              <div class="input-wrapper">
                <i class="fas fa-user input-icon"></i>
                <input type="text" id="loginIdentifier" required autocomplete="username" placeholder="you@example.com">
              </div>
            </div>
            <div class="form-group">
              <label>Password</label>
              <div class="input-wrapper">
                <i class="fas fa-lock input-icon"></i>
                <input type="password" id="loginPassword" required autocomplete="current-password" placeholder="••••••••">
                <button type="button" class="pw-toggle" data-target="loginPassword" tabindex="-1"><i class="fas fa-eye"></i></button>
              </div>
            </div>
            <button type="submit" class="auth-submit-btn" id="loginSubmitBtn">
              <span>Log In</span> <i class="fas fa-arrow-right"></i>
            </button>
          </form>
        </div>

        <div id="registerPane" class="auth-pane">
          <h2>Create your account</h2>
          <p class="auth-sub">Free forever. Start chatting and generating images in seconds.</p>
          <div class="auth-error" id="registerError"></div>
          <form class="auth-form" id="registerForm">
            <div class="form-group">
              <label>Username</label>
              <div class="input-wrapper">
                <i class="fas fa-user input-icon"></i>
                <input type="text" id="registerUsername" minlength="3" maxlength="30" required autocomplete="username" placeholder="Pick a username">
              </div>
            </div>
            <div class="form-group">
              <label>Email</label>
              <div class="input-wrapper">
                <i class="fas fa-envelope input-icon"></i>
                <input type="email" id="registerEmail" required autocomplete="email" placeholder="you@example.com">
              </div>
            </div>
            <div class="form-group">
              <label>Password</label>
              <div class="input-wrapper">
                <i class="fas fa-lock input-icon"></i>
                <input type="password" id="registerPassword" minlength="8" required autocomplete="new-password" placeholder="At least 8 characters">
                <button type="button" class="pw-toggle" data-target="registerPassword" tabindex="-1"><i class="fas fa-eye"></i></button>
              </div>
            </div>
            <button type="submit" class="auth-submit-btn" id="registerSubmitBtn">
              <span>Create Account</span> <i class="fas fa-arrow-right"></i>
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    wrapper.querySelector('#authModalClose').addEventListener('click', closeModal);
    wrapper.addEventListener('click', (e) => { if (e.target === wrapper) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrapper.classList.contains('active')) closeModal();
    });

    wrapper.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    wrapper.querySelectorAll('.pw-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const icon = btn.querySelector('i');
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        icon.classList.toggle('fa-eye', showing);
        icon.classList.toggle('fa-eye-slash', !showing);
      });
    });

    wrapper.querySelector('#loginForm').addEventListener('submit', handleLogin);
    wrapper.querySelector('#registerForm').addEventListener('submit', handleRegister);
  }

  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('authTabIndicator')?.classList.toggle('tab-register', tab === 'register');
    document.getElementById('loginPane').classList.toggle('active', tab === 'login');
    document.getElementById('registerPane').classList.toggle('active', tab === 'register');
  }

  function shakeModal() {
    const modal = document.querySelector('.auth-modal');
    if (!modal) return;
    modal.classList.remove('shake');
    // force reflow so the animation can restart if triggered again quickly
    void modal.offsetWidth;
    modal.classList.add('shake');
  }

  function openModal(tab = 'login') {
    buildModal();
    switchTab(tab);
    document.getElementById('authModalOverlay').classList.add('active');
  }

  function closeModal() {
    const overlay = document.getElementById('authModalOverlay');
    if (overlay) overlay.classList.remove('active');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const errorBox = document.getElementById('loginError');
    const btn = document.getElementById('loginSubmitBtn');
    errorBox.classList.remove('show');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    try {
      const { user } = await API.login({
        emailOrUsername: document.getElementById('loginIdentifier').value.trim(),
        password: document.getElementById('loginPassword').value,
      });
      currentUser = user;
      closeModal();
      renderNavUser();
      window.dispatchEvent(new CustomEvent('auth:login', { detail: user }));
      if (typeof window.showNotification === 'function') {
        window.showNotification(`Welcome back, ${user.username}!`, 'success');
      }
    } catch (err) {
      errorBox.innerHTML = `<i class="fas fa-circle-exclamation"></i><span>${err.message || 'Login failed.'}</span>`;
      errorBox.classList.add('show');
      shakeModal();
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Log In</span> <i class="fas fa-arrow-right"></i>';
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const errorBox = document.getElementById('registerError');
    const btn = document.getElementById('registerSubmitBtn');
    errorBox.classList.remove('show');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    try {
      const { user } = await API.register({
        username: document.getElementById('registerUsername').value.trim(),
        email: document.getElementById('registerEmail').value.trim(),
        password: document.getElementById('registerPassword').value,
      });
      currentUser = user;
      closeModal();
      renderNavUser();
      window.dispatchEvent(new CustomEvent('auth:login', { detail: user }));
      if (typeof window.showNotification === 'function') {
        window.showNotification(`Account created! Welcome, ${user.username}.`, 'success');
      }
    } catch (err) {
      errorBox.innerHTML = `<i class="fas fa-circle-exclamation"></i><span>${err.message || 'Registration failed.'}</span>`;
      errorBox.classList.add('show');
      shakeModal();
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Create Account</span> <i class="fas fa-arrow-right"></i>';
    }
  }

  async function logout() {
    try { await API.logout(); } catch (_) {}
    currentUser = null;
    window.location.href = '/index.html';
  }

  function renderNavUser() {
    const slot = document.getElementById('navAuthSlot');
    if (!slot) return;

    if (!currentUser) {
      slot.innerHTML = `<button class="btn btn-primary" id="navLoginBtn" style="padding:0.55rem 1.2rem;">Log In</button>`;
      document.getElementById('navLoginBtn').addEventListener('click', () => openModal('login'));
      return;
    }

    slot.innerHTML = `
      <div class="user-menu">
        <button class="user-avatar-btn" id="userAvatarBtn" style="background:${currentUser.avatarColor}">
          ${initials(currentUser.username)}
        </button>
        <div class="user-dropdown" id="userDropdown">
          <div style="padding:0.6rem 0.75rem;">
            <div style="font-weight:600;">${currentUser.username}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);">${currentUser.email}</div>
          </div>
          <hr>
          <a href="/dashboard.html"><i class="fas fa-gauge"></i> Dashboard</a>
          ${currentUser.role === 'admin' ? '<a href="/admin.html"><i class="fas fa-shield-halved"></i> Admin Panel</a>' : ''}
          <hr>
          <button id="logoutBtn"><i class="fas fa-right-from-bracket"></i> Log Out</button>
        </div>
      </div>
    `;

    document.getElementById('userAvatarBtn').addEventListener('click', () => {
      document.getElementById('userDropdown').classList.toggle('active');
    });
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.addEventListener('click', (e) => {
      const menu = document.querySelector('.user-menu');
      if (menu && !menu.contains(e.target)) {
        document.getElementById('userDropdown')?.classList.remove('active');
      }
    });
  }

  /** Guards a page: redirects to index if not logged in (optionally requiring admin). */
  async function guardPage({ requireAdmin = false } = {}) {
    await loadSession();
    if (!currentUser) {
      window.location.href = '/index.html';
      return null;
    }
    if (requireAdmin && currentUser.role !== 'admin') {
      window.location.href = '/dashboard.html';
      return null;
    }
    return currentUser;
  }

  return {
    loadSession, getUser, isLoggedIn, isAdmin,
    openModal, closeModal, renderNavUser, logout, guardPage, initials,
  };
})();
