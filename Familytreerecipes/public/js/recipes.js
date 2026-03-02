// Recipe List with search, filter, sort, pagination
const CATEGORIES = ['Appetizer', 'Breakfast', 'Dessert', 'Dinner', 'Drink', 'Lunch', 'Salad', 'Side Dish', 'Snack', 'Soup'];

Router.on('/family/:id/recipes', async ({ id }) => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const search = params.get('search') || '';
  const category = params.get('category') || '';
  const tag = params.get('tag') || '';
  const sort = params.get('sort') || 'newest';
  const page = parseInt(params.get('page') || '1');

  try {
    const [family, result, tags] = await Promise.all([
      API.get(`/api/families/${id}`),
      API.get(`/api/families/${id}/recipes?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&tag=${encodeURIComponent(tag)}&sort=${sort}&page=${page}&limit=12`),
      API.get(`/api/families/${id}/tags`),
    ]);

    let html = `
      <div class="page-header">
        <h1>${Router.escapeHtml(family.name)} - Recipes</h1>
        <div style="display:flex;gap:8px">
          <a href="#/family/${id}/recipes/new" class="btn btn-primary">+ Add Recipe</a>
          <a href="#/family/${id}" class="btn btn-secondary">Back</a>
        </div>
      </div>
      <div class="search-bar">
        <input type="text" id="recipe-search" placeholder="Search recipes..." value="${Router.escapeHtml(search)}">
        <select id="recipe-category">
          <option value="">All Categories</option>
          ${CATEGORIES.map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <select id="recipe-tag">
          <option value="">All Tags</option>
          ${tags.map(t => `<option value="${t}" ${t === tag ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <select id="recipe-sort">
          <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest</option>
          <option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Oldest</option>
          <option value="title" ${sort === 'title' ? 'selected' : ''}>Title A-Z</option>
          <option value="prep_time" ${sort === 'prep_time' ? 'selected' : ''}>Quick First</option>
        </select>
      </div>`;

    if (result.recipes.length === 0) {
      html += `<div class="empty-state">
        <h3>No recipes found</h3>
        <p>${search || category || tag ? 'Try adjusting your filters.' : 'Be the first to add a recipe!'}</p>
        ${!search && !category && !tag ? `<a href="#/family/${id}/recipes/new" class="btn btn-primary">Add Recipe</a>` : ''}
      </div>`;
    } else {
      html += '<div class="grid-3">';
      for (const r of result.recipes) {
        const totalTime = (r.prep_time || 0) + (r.cook_time || 0);
        html += `
          <div class="recipe-card" onclick="location.hash='#/family/${id}/recipes/${r.id}'">
            ${r.photo
              ? `<img class="recipe-card-img" src="${r.photo}" alt="${Router.escapeHtml(r.title)}">`
              : `<div class="recipe-card-img-placeholder">&#127858;</div>`
            }
            <div class="recipe-card-body">
              <h3>${Router.escapeHtml(r.title)}</h3>
              <div class="meta">
                by ${Router.escapeHtml(r.author_name)}
                ${r.attributed_first_name ? ' &middot; From ' + Router.escapeHtml(r.attributed_first_name + (r.attributed_last_name ? ' ' + r.attributed_last_name : '')) : ''}
                ${r.category ? ' &middot; ' + Router.escapeHtml(r.category) : ''}
                ${totalTime ? ' &middot; ' + totalTime + ' min' : ''}
              </div>
              ${r.tags && r.tags.length > 0
                ? `<div class="tags">${r.tags.map(t => `<span class="tag">${Router.escapeHtml(t)}</span>`).join('')}</div>`
                : ''
              }
            </div>
          </div>`;
      }
      html += '</div>';

      // Pagination
      if (result.totalPages > 1) {
        html += '<div class="pagination">';
        html += `<button ${page <= 1 ? 'disabled' : ''} onclick="RecipeList.goPage(${id}, ${page - 1})">Prev</button>`;
        for (let i = 1; i <= result.totalPages; i++) {
          html += `<button class="${i === page ? 'current' : ''}" onclick="RecipeList.goPage(${id}, ${i})">${i}</button>`;
        }
        html += `<button ${page >= result.totalPages ? 'disabled' : ''} onclick="RecipeList.goPage(${id}, ${page + 1})">Next</button>`;
        html += '</div>';
      }
    }

    Router.content.innerHTML = html;

    // Attach filter listeners
    const applyFilters = () => RecipeList.applyFilters(id);
    document.getElementById('recipe-search').addEventListener('input', debounce(applyFilters, 400));
    document.getElementById('recipe-category').addEventListener('change', applyFilters);
    document.getElementById('recipe-tag').addEventListener('change', applyFilters);
    document.getElementById('recipe-sort').addEventListener('change', applyFilters);
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

const RecipeList = {
  applyFilters(familyId) {
    const search = document.getElementById('recipe-search').value;
    const category = document.getElementById('recipe-category').value;
    const tag = document.getElementById('recipe-tag').value;
    const sort = document.getElementById('recipe-sort').value;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    if (sort && sort !== 'newest') params.set('sort', sort);
    const qs = params.toString();
    location.hash = `#/family/${familyId}/recipes${qs ? '?' + qs : ''}`;
  },

  goPage(familyId, page) {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    params.set('page', page);
    location.hash = `#/family/${familyId}/recipes?${params.toString()}`;
  }
};
