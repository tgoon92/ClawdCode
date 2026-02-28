// Redirect if already logged in
if (API.getToken()) {
  window.location.href = '/app#/dashboard';
}

// Tab switching
document.querySelectorAll('.auth-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    document.getElementById('login-form').style.display = isLogin ? '' : 'none';
    document.getElementById('signup-form').style.display = isLogin ? 'none' : '';
  });
});

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const data = await API.post('/api/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });
    API.setToken(data.token);
    API.setUser(data.user);
    window.location.href = '/app#/dashboard';
  } catch (err) {
    errEl.textContent = err.message;
  }
});

// Signup
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';
  try {
    const data = await API.post('/api/auth/signup', {
      display_name: document.getElementById('signup-name').value,
      email: document.getElementById('signup-email').value,
      password: document.getElementById('signup-password').value,
    });
    API.setToken(data.token);
    API.setUser(data.user);
    window.location.href = '/app#/dashboard';
  } catch (err) {
    errEl.textContent = err.message;
  }
});
