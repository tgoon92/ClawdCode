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
  NODE_W: 160,
  NODE_H: 60,
  H_GAP: 40,
  V_GAP: 80,
  svg: null,
  group: null,
  dragging: false,
  lastMouse: null,

  render(members, relationships, familyId) {
    this.svg = document.getElementById('tree-svg');
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;

    // Build adjacency: find parent_of relationships
    const parentOf = relationships.filter(r => r.type === 'parent_of');
    const spouseOf = relationships.filter(r => r.type === 'spouse_of' && r.from_member_id < r.to_member_id);

    // Build a map of member id -> member
    const memberMap = {};
    members.forEach(m => memberMap[m.id] = m);

    // Find children for each member
    const childrenOf = {};
    const hasParent = new Set();
    parentOf.forEach(r => {
      if (!childrenOf[r.from_member_id]) childrenOf[r.from_member_id] = [];
      childrenOf[r.from_member_id].push(r.to_member_id);
      hasParent.add(r.to_member_id);
    });

    // Find roots (no parents)
    let roots = members.filter(m => !hasParent.has(m.id)).map(m => m.id);

    // If a root has a spouse that is also a root, group them
    const spouseMap = {};
    spouseOf.forEach(r => {
      spouseMap[r.from_member_id] = r.to_member_id;
      spouseMap[r.to_member_id] = r.from_member_id;
    });

    // Remove spouse duplicates from roots - keep the one with lower id
    const rootSet = new Set(roots);
    roots = roots.filter(id => {
      const spouse = spouseMap[id];
      if (spouse && rootSet.has(spouse) && spouse < id) return false;
      return true;
    });

    // Merge children from both spouses
    const getChildren = (id) => {
      const kids = new Set(childrenOf[id] || []);
      const spouse = spouseMap[id];
      if (spouse) (childrenOf[spouse] || []).forEach(k => kids.add(k));
      return [...kids];
    };

    // Layout: assign (x, y) to each node via recursive tree layout
    const positions = {};
    let nextX = 0;

    const layout = (nodeId, depth) => {
      const children = getChildren(nodeId);
      // Filter children to only those not yet positioned (avoid duplicates)
      const unpositioned = children.filter(c => !positions[c]);

      if (unpositioned.length === 0) {
        positions[nodeId] = { x: nextX, y: depth };
        // Place spouse next to the node
        const spouse = spouseMap[nodeId];
        if (spouse && !positions[spouse]) {
          nextX++;
          positions[spouse] = { x: nextX, y: depth };
        }
        nextX++;
        return;
      }

      for (const child of unpositioned) {
        layout(child, depth + 1);
      }

      const childXs = unpositioned.map(c => positions[c].x);
      const centerX = (Math.min(...childXs) + Math.max(...childXs)) / 2;

      const spouse = spouseMap[nodeId];
      if (spouse && !positions[spouse]) {
        positions[nodeId] = { x: centerX - 0.5, y: depth };
        positions[spouse] = { x: centerX + 0.5, y: depth };
      } else {
        positions[nodeId] = { x: centerX, y: depth };
      }
    };

    // Layout each root tree
    if (roots.length === 0 && members.length > 0) {
      // No hierarchy, just lay out in a grid
      members.forEach((m, i) => {
        positions[m.id] = { x: i % 5, y: Math.floor(i / 5) };
      });
    } else {
      roots.forEach(r => layout(r, 0));
      // Position any orphans not yet laid out
      members.forEach(m => {
        if (!positions[m.id]) {
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

    // Draw connections
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

    // Draw nodes
    members.forEach(m => {
      if (!coords[m.id]) return;
      const c = coords[m.id];
      const isDeceased = m.death_year != null;
      const name = `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`;
      const years = m.birth_year ? `${m.birth_year}${m.death_year ? ' - ' + m.death_year : ''}` : '';
      svgContent += `
        <g class="tree-node ${isDeceased ? 'deceased' : ''}" data-id="${m.id}" onclick="TreeView.showTooltip(event, ${JSON.stringify(JSON.stringify({ name, years, bio: m.bio || '' }))})">
          <rect x="${c.x}" y="${c.y}" width="${this.NODE_W}" height="${this.NODE_H}"/>
          <text class="node-name" x="${c.x + this.NODE_W / 2}" y="${c.y + 25}" text-anchor="middle">${this.truncate(name, 18)}</text>
          <text class="node-years" x="${c.x + this.NODE_W / 2}" y="${c.y + 44}" text-anchor="middle">${years}</text>
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

  showTooltip(event, dataJson) {
    const data = JSON.parse(dataJson);
    // Remove existing tooltip
    document.querySelectorAll('.tree-tooltip').forEach(t => t.remove());
    const tooltip = document.createElement('div');
    tooltip.className = 'tree-tooltip';
    tooltip.innerHTML = `<h4>${Router.escapeHtml(data.name)}</h4>
      ${data.years ? `<p>${data.years}</p>` : ''}
      ${data.bio ? `<p style="margin-top:4px">${Router.escapeHtml(data.bio)}</p>` : ''}`;
    const container = document.getElementById('tree-container');
    const rect = container.getBoundingClientRect();
    tooltip.style.left = (event.clientX - rect.left + 10) + 'px';
    tooltip.style.top = (event.clientY - rect.top + 10) + 'px';
    container.appendChild(tooltip);
    setTimeout(() => tooltip.remove(), 3000);
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
