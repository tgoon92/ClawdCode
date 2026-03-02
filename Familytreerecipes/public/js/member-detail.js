// Member Detail Page
Router.on('/family/:id/members/:mid', async ({ id, mid }) => {
  try {
    const member = await API.get(`/api/families/${id}/members/${mid}`);
    const name = `${member.first_name}${member.last_name ? ' ' + member.last_name : ''}`;
    const years = member.birth_year
      ? `${member.birth_year}${member.death_year ? ' - ' + member.death_year : ' - present'}`
      : '';
    const initials = (member.first_name[0] + (member.last_name ? member.last_name[0] : '')).toUpperCase();

    let html = `
      <div class="page-header">
        <h1>${Router.escapeHtml(name)}</h1>
        <div style="display:flex;gap:8px">
          <a href="#/family/${id}/tree" class="btn btn-secondary">Family Tree</a>
          <a href="#/family/${id}/members" class="btn btn-secondary">All Members</a>
        </div>
      </div>
      <div class="member-detail-layout">
        <div class="card member-profile-card">
          ${member.profile_picture
            ? `<img class="member-avatar-large" src="${member.profile_picture}" alt="${Router.escapeHtml(name)}">`
            : `<div class="avatar-initials-large">${initials}</div>`
          }
          <h2 style="margin-top:16px">${Router.escapeHtml(name)}</h2>
          ${years ? `<p class="member-years">${years}</p>` : ''}
          ${member.bio ? `<p class="member-bio">${Router.escapeHtml(member.bio)}</p>` : ''}
          ${member.linked_user_name ? `<p class="member-linked">Linked account: ${Router.escapeHtml(member.linked_user_name)}</p>` : ''}
        </div>
        <div class="member-detail-right">`;

    // Relationships section
    html += `<div class="card">
      <div class="card-header"><h3>Relationships</h3></div>`;
    if (member.relationships && member.relationships.length > 0) {
      // Deduplicate symmetric relationships
      const seen = new Set();
      const uniqueRels = member.relationships.filter(r => {
        const key = [Math.min(r.from_member_id, r.to_member_id), Math.max(r.from_member_id, r.to_member_id), r.type].join('-');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const r of uniqueRels) {
        const relName = `${r.related_first_name}${r.related_last_name ? ' ' + r.related_last_name : ''}`;
        const relatedId = r.from_member_id == mid ? r.to_member_id : r.from_member_id;
        const relInitials = (r.related_first_name[0] + (r.related_last_name ? r.related_last_name[0] : '')).toUpperCase();
        let label = r.type.replace(/_/g, ' ');
        // Adjust label direction for parent_of
        if (r.type === 'parent_of') {
          label = r.direction === 'from' ? 'parent of' : 'child of';
        }
        html += `
          <a href="#/family/${id}/members/${relatedId}" class="member-rel-item">
            ${r.related_profile_picture
              ? `<img class="avatar-sm" src="${r.related_profile_picture}" alt="${Router.escapeHtml(relName)}">`
              : `<span class="avatar-initials-sm">${relInitials}</span>`
            }
            <div>
              <strong>${Router.escapeHtml(relName)}</strong>
              <span class="rel-label">${label}</span>
            </div>
          </a>`;
      }
    } else {
      html += '<p style="color:var(--text-light);padding:8px 0">No relationships defined yet.</p>';
    }
    html += '</div>';

    // Recipes section
    html += `<div class="card">
      <div class="card-header"><h3>Recipes</h3></div>`;
    if (member.recipes && member.recipes.length > 0) {
      for (const r of member.recipes) {
        html += `
          <a href="#/family/${id}/recipes/${r.id}" class="member-recipe-item">
            <div>
              <strong>${Router.escapeHtml(r.title)}</strong>
              <span class="recipe-item-meta">${r.category ? Router.escapeHtml(r.category) + ' &middot; ' : ''}by ${Router.escapeHtml(r.author_name)}</span>
            </div>
          </a>`;
      }
    } else {
      html += '<p style="color:var(--text-light);padding:8px 0">No recipes attributed to this member yet.</p>';
    }
    html += '</div></div></div>';

    Router.content.innerHTML = html;
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});
