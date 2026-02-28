// === Dashboard ===
Router.on('/dashboard', async () => {
  try {
    const families = await API.get('/api/families');
    let html = `
      <div class="page-header">
        <h1>My Families</h1>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" onclick="Family.showCreateModal()">+ Create Family</button>
          <button class="btn btn-secondary" onclick="Family.showJoinModal()">Join Family</button>
        </div>
      </div>`;

    if (families.length === 0) {
      html += `<div class="empty-state">
        <h3>No families yet</h3>
        <p>Create a family to start sharing recipes and building your family tree.</p>
      </div>`;
    } else {
      html += '<div class="grid-2">';
      for (const f of families) {
        html += `
          <div class="family-card" onclick="location.hash='#/family/${f.id}'">
            <h3>${Router.escapeHtml(f.name)}</h3>
            <div class="stats">
              <span>${f.member_count} member${f.member_count !== 1 ? 's' : ''}</span>
              <span>${f.recipe_count} recipe${f.recipe_count !== 1 ? 's' : ''}</span>
              <span>Role: ${f.role}</span>
            </div>
          </div>`;
      }
      html += '</div>';
    }
    Router.content.innerHTML = html;
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

// === Family Detail ===
Router.on('/family/:id', async ({ id }) => {
  try {
    const family = await API.get(`/api/families/${id}`);
    const recipes = await API.get(`/api/families/${id}/recipes?limit=4`);
    const html = `
      <div class="page-header">
        <h1>${Router.escapeHtml(family.name)}</h1>
        <div style="display:flex;gap:8px">
          <a href="#/family/${id}/tree" class="btn btn-secondary">&#127795; Family Tree</a>
          <a href="#/family/${id}/members" class="btn btn-secondary">Members</a>
          <a href="#/family/${id}/recipes" class="btn btn-primary">Recipes</a>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3>Family Info</h3></div>
          <p><strong>Members in tree:</strong> ${family.tree_member_count}</p>
          <p><strong>Recipes:</strong> ${family.recipe_count}</p>
          <p><strong>Your role:</strong> ${family.role}</p>
          <div style="margin-top:16px">
            <label style="font-size:0.85rem;color:var(--text-light);font-family:-apple-system,sans-serif">Invite Code</label>
            <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
              <span class="invite-code" id="invite-code">${family.invite_code}</span>
              <button class="btn btn-sm btn-secondary" onclick="Family.copyInvite()">Copy</button>
              ${family.role === 'admin' ? `<button class="btn btn-sm btn-secondary" onclick="Family.regenerateCode(${id})">Regenerate</button>` : ''}
            </div>
          </div>
          ${family.role === 'admin' ? `
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="btn btn-sm btn-secondary" onclick="Family.showEditModal(${id}, '${Router.escapeHtml(family.name).replace(/'/g, "\\'")}')">Edit Name</button>
            <button class="btn btn-sm btn-danger" onclick="Family.deleteFamily(${id})">Delete Family</button>
          </div>` : ''}
        </div>
        <div class="card">
          <div class="card-header">
            <h3>Recent Recipes</h3>
            <a href="#/family/${id}/recipes" class="btn btn-sm btn-secondary">View All</a>
          </div>
          ${recipes.recipes.length === 0
            ? '<p style="color:var(--text-light)">No recipes yet. Be the first to add one!</p>'
            : recipes.recipes.map(r => `
              <div class="member-item" style="cursor:pointer" onclick="location.hash='#/family/${id}/recipes/${r.id}'">
                <div class="member-info">
                  <h4>${Router.escapeHtml(r.title)}</h4>
                  <p>by ${Router.escapeHtml(r.author_name)} ${r.category ? '&middot; ' + Router.escapeHtml(r.category) : ''}</p>
                </div>
              </div>`).join('')
          }
        </div>
      </div>`;
    Router.content.innerHTML = html;
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

// === Members Management ===
Router.on('/family/:id/members', async ({ id }) => {
  try {
    const [family, members, relationships, users] = await Promise.all([
      API.get(`/api/families/${id}`),
      API.get(`/api/families/${id}/members`),
      API.get(`/api/families/${id}/relationships`),
      API.get(`/api/families/${id}/users`)
    ]);

    let html = `
      <div class="page-header">
        <h1>${Router.escapeHtml(family.name)} - Members</h1>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" onclick="Family.showAddMemberModal(${id})">+ Add Member</button>
          <a href="#/family/${id}" class="btn btn-secondary">Back</a>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3>Family Tree Members</h3></div>
          ${members.length === 0
            ? '<p style="color:var(--text-light)">No members in the tree yet. Add family members to build your tree.</p>'
            : members.map(m => `
              <div class="member-item">
                <div class="member-info">
                  <h4>${Router.escapeHtml(m.first_name)}${m.last_name ? ' ' + Router.escapeHtml(m.last_name) : ''}</h4>
                  <p>${m.birth_year ? m.birth_year : ''}${m.death_year ? ' - ' + m.death_year : m.birth_year ? ' - present' : ''}${m.linked_user_name ? ' (linked: ' + Router.escapeHtml(m.linked_user_name) + ')' : ''}</p>
                </div>
                <div class="member-actions">
                  <button class="btn btn-sm btn-secondary" onclick="Family.showEditMemberModal(${id}, ${JSON.stringify(JSON.stringify(m))})">Edit</button>
                  <button class="btn btn-sm btn-secondary" onclick="Family.showRelationshipModal(${id}, ${m.id}, '${Router.escapeHtml(m.first_name).replace(/'/g, "\\'")}')">Relations</button>
                  <button class="btn btn-sm btn-danger" onclick="Family.deleteMember(${id}, ${m.id})">Del</button>
                </div>
              </div>`).join('')
          }
        </div>
        <div class="card">
          <div class="card-header"><h3>Relationships</h3></div>
          ${relationships.length === 0
            ? '<p style="color:var(--text-light)">No relationships defined yet.</p>'
            : relationships.filter(r => r.type === 'parent_of' || (r.type !== 'parent_of' && r.from_member_id < r.to_member_id)).map(r => `
              <div class="member-item">
                <div class="member-info">
                  <h4>${Router.escapeHtml(r.from_first_name)} ${r.type.replace('_', ' ')} ${Router.escapeHtml(r.to_first_name)}</h4>
                </div>
                <button class="btn btn-sm btn-danger" onclick="Family.deleteRelationship(${id}, ${r.from_member_id}, ${r.to_member_id}, '${r.type}')">Remove</button>
              </div>`).join('')
          }
        </div>
      </div>`;
    Router.content.innerHTML = html;
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

// === Settings ===
Router.on('/settings', async () => {
  try {
    const user = await API.get('/api/auth/me');
    Router.content.innerHTML = `
      <div class="page-header"><h1>Settings</h1></div>
      <div class="card" style="max-width:500px">
        <h3 style="margin-bottom:16px">Profile</h3>
        <form id="settings-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" value="${Router.escapeHtml(user.email)}" disabled style="background:var(--cream-dark)">
          </div>
          <div class="form-group">
            <label>Display Name</label>
            <input type="text" id="settings-name" value="${Router.escapeHtml(user.display_name)}" required>
          </div>
          <h3 style="margin:20px 0 16px">Change Password</h3>
          <div class="form-group">
            <label>Current Password</label>
            <input type="password" id="settings-current-pw">
          </div>
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="settings-new-pw" minlength="6">
          </div>
          <div id="settings-error" class="error-msg"></div>
          <div id="settings-success" style="color:var(--green);font-size:0.85rem;margin-bottom:8px"></div>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </form>
      </div>`;

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('settings-error');
      const successEl = document.getElementById('settings-success');
      errEl.textContent = '';
      successEl.textContent = '';
      try {
        const body = { display_name: document.getElementById('settings-name').value };
        const curPw = document.getElementById('settings-current-pw').value;
        const newPw = document.getElementById('settings-new-pw').value;
        if (newPw) {
          body.current_password = curPw;
          body.new_password = newPw;
        }
        const updated = await API.put('/api/auth/me', body);
        API.setUser({ ...API.getUser(), display_name: updated.display_name });
        document.getElementById('user-display-name').textContent = updated.display_name;
        successEl.textContent = 'Settings saved successfully!';
        document.getElementById('settings-current-pw').value = '';
        document.getElementById('settings-new-pw').value = '';
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

// === Family Module ===
const Family = {
  showCreateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Create Family</h2>
        <form id="create-family-form">
          <div class="form-group">
            <label>Family Name</label>
            <input type="text" id="family-name" required placeholder="e.g. The Smith Family">
          </div>
          <div id="create-family-error" class="error-msg"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('create-family-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const family = await API.post('/api/families', { name: document.getElementById('family-name').value });
        overlay.remove();
        Router.loadFamilyNav();
        location.hash = `#/family/${family.id}`;
      } catch (err) {
        document.getElementById('create-family-error').textContent = err.message;
      }
    });
  },

  showJoinModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Join a Family</h2>
        <form id="join-family-form">
          <div class="form-group">
            <label>Invite Code</label>
            <input type="text" id="join-code" required placeholder="Enter 8-character code" maxlength="8" style="text-transform:uppercase;letter-spacing:2px;font-family:monospace;font-size:1.1rem">
          </div>
          <div id="join-family-error" class="error-msg"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">Join</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('join-family-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const family = await API.post('/api/families/join', { invite_code: document.getElementById('join-code').value });
        overlay.remove();
        Router.loadFamilyNav();
        location.hash = `#/family/${family.id}`;
      } catch (err) {
        document.getElementById('join-family-error').textContent = err.message;
      }
    });
  },

  showEditModal(id, currentName) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Edit Family</h2>
        <form id="edit-family-form">
          <div class="form-group">
            <label>Family Name</label>
            <input type="text" id="edit-family-name" value="${currentName}" required>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('edit-family-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await API.put(`/api/families/${id}`, { name: document.getElementById('edit-family-name').value });
      overlay.remove();
      Router.loadFamilyNav();
      Router.resolve();
    });
  },

  async deleteFamily(id) {
    if (!confirm('Are you sure you want to delete this family? This cannot be undone.')) return;
    await API.del(`/api/families/${id}`);
    Router.loadFamilyNav();
    location.hash = '#/dashboard';
  },

  copyInvite() {
    const code = document.getElementById('invite-code').textContent;
    navigator.clipboard.writeText(code);
    const btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  },

  async regenerateCode(id) {
    if (!confirm('Regenerate invite code? The old code will stop working.')) return;
    const result = await API.post(`/api/families/${id}/regenerate-code`);
    document.getElementById('invite-code').textContent = result.invite_code;
  },

  showAddMemberModal(familyId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Add Family Member</h2>
        <form id="add-member-form">
          <div class="form-row">
            <div class="form-group">
              <label>First Name *</label>
              <input type="text" id="member-first" required>
            </div>
            <div class="form-group">
              <label>Last Name</label>
              <input type="text" id="member-last">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Birth Year</label>
              <input type="number" id="member-birth" min="1000" max="2100">
            </div>
            <div class="form-group">
              <label>Death Year</label>
              <input type="number" id="member-death" min="1000" max="2100">
            </div>
          </div>
          <div class="form-group">
            <label>Bio</label>
            <textarea id="member-bio" placeholder="A short description..."></textarea>
          </div>
          <div id="add-member-error" class="error-msg"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('add-member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.post(`/api/families/${familyId}/members`, {
          first_name: document.getElementById('member-first').value,
          last_name: document.getElementById('member-last').value || null,
          birth_year: document.getElementById('member-birth').value ? parseInt(document.getElementById('member-birth').value) : null,
          death_year: document.getElementById('member-death').value ? parseInt(document.getElementById('member-death').value) : null,
          bio: document.getElementById('member-bio').value || null,
        });
        overlay.remove();
        Router.resolve();
      } catch (err) {
        document.getElementById('add-member-error').textContent = err.message;
      }
    });
  },

  showEditMemberModal(familyId, memberJson) {
    const m = JSON.parse(memberJson);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Edit Member</h2>
        <form id="edit-member-form">
          <div class="form-row">
            <div class="form-group">
              <label>First Name *</label>
              <input type="text" id="em-first" value="${Router.escapeHtml(m.first_name)}" required>
            </div>
            <div class="form-group">
              <label>Last Name</label>
              <input type="text" id="em-last" value="${m.last_name ? Router.escapeHtml(m.last_name) : ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Birth Year</label>
              <input type="number" id="em-birth" value="${m.birth_year || ''}" min="1000" max="2100">
            </div>
            <div class="form-group">
              <label>Death Year</label>
              <input type="number" id="em-death" value="${m.death_year || ''}" min="1000" max="2100">
            </div>
          </div>
          <div class="form-group">
            <label>Bio</label>
            <textarea id="em-bio">${m.bio ? Router.escapeHtml(m.bio) : ''}</textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('edit-member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await API.put(`/api/families/${familyId}/members/${m.id}`, {
        first_name: document.getElementById('em-first').value,
        last_name: document.getElementById('em-last').value || null,
        birth_year: document.getElementById('em-birth').value ? parseInt(document.getElementById('em-birth').value) : null,
        death_year: document.getElementById('em-death').value ? parseInt(document.getElementById('em-death').value) : null,
        bio: document.getElementById('em-bio').value || null,
      });
      overlay.remove();
      Router.resolve();
    });
  },

  async showRelationshipModal(familyId, memberId, memberName) {
    const members = await API.get(`/api/families/${familyId}/members`);
    const others = members.filter(m => m.id !== memberId);
    if (others.length === 0) {
      alert('Add more members before creating relationships.');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Add Relationship for ${memberName}</h2>
        <form id="rel-form">
          <div class="form-group">
            <label>Relationship Type</label>
            <select id="rel-type">
              <option value="parent_of">Parent of</option>
              <option value="spouse_of">Spouse of</option>
              <option value="sibling_of">Sibling of</option>
            </select>
          </div>
          <div class="form-group">
            <label>Related Member</label>
            <select id="rel-target">
              ${others.map(m => `<option value="${m.id}">${Router.escapeHtml(m.first_name)}${m.last_name ? ' ' + Router.escapeHtml(m.last_name) : ''}</option>`).join('')}
            </select>
          </div>
          <div id="rel-error" class="error-msg"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('rel-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.post(`/api/families/${familyId}/relationships`, {
          from_member_id: memberId,
          to_member_id: parseInt(document.getElementById('rel-target').value),
          type: document.getElementById('rel-type').value,
        });
        overlay.remove();
        Router.resolve();
      } catch (err) {
        document.getElementById('rel-error').textContent = err.message;
      }
    });
  },

  async deleteMember(familyId, memberId) {
    if (!confirm('Delete this member? Their relationships will also be removed.')) return;
    await API.del(`/api/families/${familyId}/members/${memberId}`);
    Router.resolve();
  },

  async deleteRelationship(familyId, fromId, toId, type) {
    await API.del(`/api/families/${familyId}/relationships`, { from_member_id: fromId, to_member_id: toId, type });
    Router.resolve();
  },
};
