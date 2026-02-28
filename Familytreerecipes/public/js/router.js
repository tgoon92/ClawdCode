// Redirect if not logged in
if (!API.getToken()) {
  window.location.href = '/';
}

const Router = {
  routes: [],
  content: null,

  init() {
    this.content = document.getElementById('app-content');
    window.addEventListener('hashchange', () => this.resolve());

    // Setup user info
    const user = API.getUser();
    if (user) {
      document.getElementById('user-display-name').textContent = user.display_name;
    }

    // Logout
    document.getElementById('logout-link').addEventListener('click', (e) => {
      e.preventDefault();
      API.logout();
    });

    // Hamburger
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));
    this.content.addEventListener('click', () => sidebar.classList.remove('open'));

    // Load sidebar nav
    this.loadFamilyNav();

    // Default route
    if (!location.hash || location.hash === '#/') {
      location.hash = '#/dashboard';
    } else {
      this.resolve();
    }
  },

  on(pattern, handler) {
    // Convert :param to regex groups
    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
    this.routes.push({ regex, handler });
  },

  resolve() {
    const hash = location.hash.slice(1) || '/dashboard';
    for (const route of this.routes) {
      const match = hash.match(route.regex);
      if (match) {
        this.content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
        route.handler(match.groups || {});
        this.updateActiveNav(hash);
        return;
      }
    }
    this.content.innerHTML = '<div class="empty-state"><h3>Page Not Found</h3><p>The page you\'re looking for doesn\'t exist.</p><a href="#/dashboard" class="btn btn-primary">Go to Dashboard</a></div>';
  },

  updateActiveNav(hash) {
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + hash);
    });
  },

  async loadFamilyNav() {
    try {
      const families = await API.get('/api/families');
      const container = document.getElementById('family-nav-links');
      if (families.length === 0) {
        container.innerHTML = '';
        return;
      }
      let html = '<div class="nav-section">My Families</div>';
      for (const f of families) {
        html += `<a href="#/family/${f.id}">&#127795; ${this.escapeHtml(f.name)}</a>`;
      }
      container.innerHTML = html;
    } catch (e) {
      console.error('Failed to load family nav', e);
    }
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Initialize after all scripts load
window.addEventListener('DOMContentLoaded', () => {
  // Routes are registered by each module, then init resolves
  setTimeout(() => Router.init(), 0);
});
