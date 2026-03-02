// Family Tree SVG Visualization
Router.on('/family/:id/tree', async ({ id }) => {
  try {
    const [family, members, relationships] = await Promise.all([
      API.get(`/api/families/${id}`),
      API.get(`/api/families/${id}/members`),
      API.get(`/api/families/${id}/relationships`),
    ]);

    let html = `
      <div class="page-header">
        <h1>${Router.escapeHtml(family.name)} - Family Tree</h1>
        <div style="display:flex;gap:8px">
          <a href="#/family/${id}/members" class="btn btn-secondary">Edit Members</a>
          <a href="#/family/${id}" class="btn btn-secondary">Back</a>
        </div>
      </div>`;

    if (members.length === 0) {
      html += `<div class="empty-state">
        <h3>No family members yet</h3>
        <p>Add members and define relationships to build your family tree.</p>
        <a href="#/family/${id}/members" class="btn btn-primary">Add Members</a>
      </div>`;
      Router.content.innerHTML = html;
      return;
    }

    html += `
      <div class="tree-container" id="tree-container">
        <div class="tree-controls">
          <button onclick="TreeView.zoomIn()" title="Zoom in">+</button>
          <button onclick="TreeView.zoomOut()" title="Zoom out">-</button>
          <button onclick="TreeView.resetView()" title="Reset view">&#8634;</button>
        </div>
        <svg id="tree-svg"></svg>
      </div>`;

    Router.content.innerHTML = html;
    TreeView.render(members, relationships, id);
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

const TreeView = {
  scale: 1,
  panX: 0,
  panY: 0,
  NODE_W: 200,
  NODE_H: 80,
  H_GAP: 40,
  V_GAP: 90,
  svg: null,
  group: null,
  dragging: false,
  lastMouse: null,

  render(members, relationships, familyId) {
    this.svg = document.getElementById('tree-svg');
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;

    // Build adjacency
    const parentOf = relationships.filter(r => r.type === 'parent_of');
    const spouseOf = relationships.filter(r => r.type === 'spouse_of' && r.from_member_id < r.to_member_id);
    const exSpouseOf = relationships.filter(r => r.type === 'ex_spouse_of' && r.from_member_id < r.to_member_id);

    // Build a map of member id -> member
    const memberMap = {};
    members.forEach(m => memberMap[m.id] = m);

    // Build multi-partner map: partnerMap[id] = [{ id, type }, ...]
    const partnerMap = {};
    const addPartner = (a, b, type) => {
      if (!partnerMap[a]) partnerMap[a] = [];
      if (!partnerMap[a].some(p => p.id === b)) partnerMap[a].push({ id: b, type });
    };
    spouseOf.forEach(r => {
      addPartner(r.from_member_id, r.to_member_id, 'spouse_of');
      addPartner(r.to_member_id, r.from_member_id, 'spouse_of');
    });
    exSpouseOf.forEach(r => {
      addPartner(r.from_member_id, r.to_member_id, 'ex_spouse_of');
      addPartner(r.to_member_id, r.from_member_id, 'ex_spouse_of');
    });

    // Find children for each member
    const childrenOf = {};
    const hasParent = new Set();
    parentOf.forEach(r => {
      if (!childrenOf[r.from_member_id]) childrenOf[r.from_member_id] = [];
      childrenOf[r.from_member_id].push(r.to_member_id);
      hasParent.add(r.to_member_id);
    });

    // Merge children from all partners
    const getChildren = (id) => {
      const kids = new Set(childrenOf[id] || []);
      const partners = partnerMap[id] || [];
      partners.forEach(p => {
        (childrenOf[p.id] || []).forEach(k => kids.add(k));
      });
      return [...kids];
    };

    // Find roots (no parents)
    let roots = members.filter(m => !hasParent.has(m.id)).map(m => m.id);

    // Remove partner duplicates from roots - keep the one with lower id
    const rootSet = new Set(roots);
    roots = roots.filter(id => {
      const partners = partnerMap[id] || [];
      for (const p of partners) {
        if (rootSet.has(p.id) && p.id < id) return false;
      }
      return true;
    });

    // Layout: assign (x, y) to each node via recursive tree layout
    const positions = {};
    let nextX = 0;

    const layout = (nodeId, depth) => {
      const children = getChildren(nodeId);
      const unpositioned = children.filter(c => !positions[c]);

      // Gather unpositioned partners (current spouses first, then ex-spouses)
      const partners = (partnerMap[nodeId] || [])
        .filter(p => !positions[p.id])
        .sort((a, b) => (a.type === 'spouse_of' ? 0 : 1) - (b.type === 'spouse_of' ? 0 : 1));

      if (unpositioned.length === 0) {
        // Place the node and its partners as a unit
        positions[nodeId] = { x: nextX, y: depth };
        partners.forEach(p => {
          nextX++;
          positions[p.id] = { x: nextX, y: depth };
        });
        nextX++;
        return;
      }

      for (const child of unpositioned) {
        layout(child, depth + 1);
      }

      const childXs = unpositioned.map(c => positions[c].x);
      const centerX = (Math.min(...childXs) + Math.max(...childXs)) / 2;

      if (partners.length > 0) {
        // Center the unit (node + partners) above children
        const unitWidth = partners.length; // number of gaps
        const unitStart = centerX - unitWidth / 2;
        positions[nodeId] = { x: unitStart, y: depth };
        partners.forEach((p, i) => {
          positions[p.id] = { x: unitStart + i + 1, y: depth };
        });
      } else {
        positions[nodeId] = { x: centerX, y: depth };
      }
    };

    // Layout each root tree
    if (roots.length === 0 && members.length > 0) {
      members.forEach((m, i) => {
        positions[m.id] = { x: i % 5, y: Math.floor(i / 5) };
      });
    } else {
      roots.forEach(r => layout(r, 0));
      // Second pass: position any orphaned partners next to their already-placed partner
      members.forEach(m => {
        if (positions[m.id]) return;
        const partners = partnerMap[m.id] || [];
        const placedPartner = partners.find(p => positions[p.id]);
        if (placedPartner) {
          positions[m.id] = { x: positions[placedPartner.id].x + 1, y: positions[placedPartner.id].y };
        } else {
          positions[m.id] = { x: nextX, y: 0 };
          nextX++;
        }
      });
    }

    // Convert grid positions to pixel coordinates
    const PAD = 40;
    const coords = {};
    Object.keys(positions).forEach(id => {
      const p = positions[id];
      coords[id] = {
        x: PAD + p.x * (this.NODE_W + this.H_GAP),
        y: PAD + p.y * (this.NODE_H + this.V_GAP),
      };
    });

    // Calculate SVG size
    const allCoords = Object.values(coords);
    const svgW = Math.max(800, Math.max(...allCoords.map(c => c.x)) + this.NODE_W + PAD * 2);
    const svgH = Math.max(500, Math.max(...allCoords.map(c => c.y)) + this.NODE_H + PAD * 2);

    // Build SVG
    let svgContent = `<g id="tree-group">`;

    // Draw parent connections
    parentOf.forEach(r => {
      if (!coords[r.from_member_id] || !coords[r.to_member_id]) return;
      const from = coords[r.from_member_id];
      const to = coords[r.to_member_id];
      const x1 = from.x + this.NODE_W / 2;
      const y1 = from.y + this.NODE_H;
      const x2 = to.x + this.NODE_W / 2;
      const y2 = to.y;
      const midY = (y1 + y2) / 2;
      svgContent += `<path class="tree-connector" d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}"/>`;
    });

    // Draw spouse connections
    spouseOf.forEach(r => {
      if (!coords[r.from_member_id] || !coords[r.to_member_id]) return;
      const from = coords[r.from_member_id];
      const to = coords[r.to_member_id];
      const x1 = from.x + this.NODE_W;
      const y1 = from.y + this.NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + this.NODE_H / 2;
      svgContent += `<line class="tree-spouse-connector" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    });

    // Draw ex-spouse connections with divorce mark
    exSpouseOf.forEach(r => {
      if (!coords[r.from_member_id] || !coords[r.to_member_id]) return;
      const from = coords[r.from_member_id];
      const to = coords[r.to_member_id];
      const x1 = from.x + this.NODE_W;
      const y1 = from.y + this.NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + this.NODE_H / 2;
      svgContent += `<line class="tree-ex-spouse-connector" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      // Divorce mark (red X) at midpoint
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      svgContent += `<text class="tree-divorce-mark" x="${mx}" y="${my}">&#10005;</text>`;
    });

    // Define clip paths for avatars
    svgContent += '<defs>';
    members.forEach(m => {
      if (!coords[m.id]) return;
      const c = coords[m.id];
      const avatarR = 22;
      const cx = c.x + 30;
      const cy = c.y + this.NODE_H / 2;
      svgContent += `<clipPath id="avatar-clip-${m.id}"><circle cx="${cx}" cy="${cy}" r="${avatarR}"/></clipPath>`;
    });
    svgContent += `<filter id="node-shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.12"/></filter>`;
    svgContent += '</defs>';

    // Draw nodes
    members.forEach(m => {
      if (!coords[m.id]) return;
      const c = coords[m.id];
      const isDeceased = m.death_year != null;
      const name = `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`;
      const years = m.birth_year ? `${m.birth_year}${m.death_year ? ' - ' + m.death_year : ''}` : '';
      const initials = (m.first_name[0] + (m.last_name ? m.last_name[0] : '')).toUpperCase();
      const avatarR = 22;
      const avatarCx = c.x + 30;
      const avatarCy = c.y + this.NODE_H / 2;
      const textX = c.x + 62;

      svgContent += `
        <g class="tree-node ${isDeceased ? 'deceased' : ''}" data-id="${m.id}" data-family-id="${familyId}"
           onclick="location.hash='#/family/${familyId}/members/${m.id}'" style="cursor:pointer">
          <title>${this.escapeXml(name)}${years ? ' (' + years + ')' : ''}${m.bio ? ' - ' + m.bio : ''}</title>
          <rect x="${c.x}" y="${c.y}" width="${this.NODE_W}" height="${this.NODE_H}" filter="url(#node-shadow)"/>`;

      if (m.profile_picture) {
        svgContent += `<image href="${m.profile_picture}" x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" clip-path="url(#avatar-clip-${m.id})" preserveAspectRatio="xMidYMid slice"/>`;
        svgContent += `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="none" stroke="var(--terracotta-light)" stroke-width="2"/>`;
      } else {
        svgContent += `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="#2D6A4F"/>`;
        svgContent += `<text x="${avatarCx}" y="${avatarCy + 5}" text-anchor="middle" fill="white" font-size="12" font-weight="600" pointer-events="none">${initials}</text>`;
      }

      svgContent += `
          <text class="node-name" x="${textX}" y="${c.y + 32}" text-anchor="start">${this.truncate(name, 16)}</text>
          <text class="node-years" x="${textX}" y="${c.y + 50}" text-anchor="start">${years}</text>
        </g>`;
    });

    svgContent += `</g>`;
    this.svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    this.svg.innerHTML = svgContent;
    this.group = document.getElementById('tree-group');
    this.setupPanZoom();
  },

  truncate(str, max) {
    return str.length > max ? str.substring(0, max - 1) + '...' : str;
  },

  escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  },

  setupPanZoom() {
    const container = document.getElementById('tree-container');
    let isPanning = false;
    let startX, startY;

    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tree-node') || e.target.closest('.tree-controls')) return;
      isPanning = true;
      startX = e.clientX - this.panX;
      startY = e.clientY - this.panY;
    });
    document.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      this.panX = e.clientX - startX;
      this.panY = e.clientY - startY;
      this.applyTransform();
    });
    document.addEventListener('mouseup', () => { isPanning = false; });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.scale = Math.max(0.3, Math.min(3, this.scale * delta));
      this.applyTransform();
    }, { passive: false });
  },

  applyTransform() {
    if (this.group) {
      this.group.setAttribute('transform', `translate(${this.panX},${this.panY}) scale(${this.scale})`);
    }
  },

  zoomIn() {
    this.scale = Math.min(3, this.scale * 1.2);
    this.applyTransform();
  },
  zoomOut() {
    this.scale = Math.max(0.3, this.scale / 1.2);
    this.applyTransform();
  },
  resetView() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }
};
