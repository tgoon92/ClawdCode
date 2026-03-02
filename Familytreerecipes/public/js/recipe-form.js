// New Recipe
Router.on('/family/:id/recipes/new', async ({ id }) => {
  try {
    const [family, members] = await Promise.all([
      API.get(`/api/families/${id}`),
      API.get(`/api/families/${id}/members`),
    ]);
    Router.content.innerHTML = RecipeForm.buildForm(id, family.name, null, members);
    RecipeForm.init();
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

// Edit Recipe
Router.on('/family/:id/recipes/:rid/edit', async ({ id, rid }) => {
  try {
    const [family, recipe, members] = await Promise.all([
      API.get(`/api/families/${id}`),
      API.get(`/api/families/${id}/recipes/${rid}`),
      API.get(`/api/families/${id}/members`),
    ]);
    Router.content.innerHTML = RecipeForm.buildForm(id, family.name, recipe, members);
    RecipeForm.init(recipe);
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

const RecipeForm = {
  photoUrl: null,

  buildForm(familyId, familyName, recipe, members = []) {
    const isEdit = !!recipe;
    const title = isEdit ? 'Edit Recipe' : 'New Recipe';
    let ingredients = [''];
    let instructions = [''];
    let tags = '';

    if (recipe) {
      try { ingredients = JSON.parse(recipe.ingredients); } catch { ingredients = []; }
      try { instructions = JSON.parse(recipe.instructions); } catch { instructions = []; }
      if (ingredients.length === 0) ingredients = [''];
      if (instructions.length === 0) instructions = [''];
      tags = (recipe.tags || []).join(', ');
      this.photoUrl = recipe.photo;
    } else {
      this.photoUrl = null;
    }

    return `
      <div class="page-header">
        <h1>${title}</h1>
        <a href="#/family/${familyId}/recipes${isEdit ? '/' + recipe.id : ''}" class="btn btn-secondary">Cancel</a>
      </div>
      <form id="recipe-form" class="card" style="max-width:700px">
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="rf-title" required value="${isEdit ? Router.escapeHtml(recipe.title) : ''}">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="rf-desc">${isEdit && recipe.description ? Router.escapeHtml(recipe.description) : ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select id="rf-category">
              <option value="">Select...</option>
              ${CATEGORIES.map(c => `<option value="${c}" ${isEdit && recipe.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Tags (comma-separated)</label>
            <input type="text" id="rf-tags" placeholder="e.g. holiday, quick, vegan" value="${Router.escapeHtml(tags)}">
          </div>
        </div>
        <div class="form-group">
          <label>Attributed to (family member)</label>
          <select id="rf-attributed">
            <option value="">None</option>
            ${members.map(m => `<option value="${m.id}" ${isEdit && recipe.attributed_member_id == m.id ? 'selected' : ''}>${Router.escapeHtml(m.first_name)}${m.last_name ? ' ' + Router.escapeHtml(m.last_name) : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Prep Time (min)</label>
            <input type="number" id="rf-prep" min="0" value="${isEdit && recipe.prep_time ? recipe.prep_time : ''}">
          </div>
          <div class="form-group">
            <label>Cook Time (min)</label>
            <input type="number" id="rf-cook" min="0" value="${isEdit && recipe.cook_time ? recipe.cook_time : ''}">
          </div>
          <div class="form-group">
            <label>Servings</label>
            <input type="number" id="rf-servings" min="1" value="${isEdit && recipe.servings ? recipe.servings : ''}">
          </div>
        </div>

        <div class="form-group">
          <label>Photo</label>
          <div class="photo-upload" id="photo-upload" onclick="document.getElementById('photo-input').click()">
            <input type="file" id="photo-input" accept=".jpg,.jpeg,.png,.webp">
            <div id="photo-preview">
              ${this.photoUrl ? `<img src="${this.photoUrl}" alt="Recipe photo">` : '<p class="placeholder">Click to upload a photo (max 5MB)</p>'}
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Ingredients</label>
          <ul class="dynamic-list" id="ingredients-list">
            ${ingredients.map((ing, i) => `
              <li>
                <input type="text" placeholder="e.g. 2 cups flour" value="${Router.escapeHtml(ing)}">
                <button type="button" class="remove-item" onclick="RecipeForm.removeItem(this)">&times;</button>
              </li>`).join('')}
          </ul>
          <button type="button" class="add-item" onclick="RecipeForm.addIngredient()">+ Add ingredient</button>
        </div>

        <div class="form-group">
          <label>Instructions</label>
          <ul class="dynamic-list" id="instructions-list">
            ${instructions.map((inst, i) => `
              <li>
                <textarea placeholder="Step ${i + 1}...">${Router.escapeHtml(inst)}</textarea>
                <button type="button" class="remove-item" onclick="RecipeForm.removeItem(this)">&times;</button>
              </li>`).join('')}
          </ul>
          <button type="button" class="add-item" onclick="RecipeForm.addInstruction()">+ Add step</button>
        </div>

        <div class="form-group">
          <label>Family Story</label>
          <textarea id="rf-story" style="min-height:100px" placeholder="Share the story behind this recipe...">${isEdit && recipe.family_story ? Router.escapeHtml(recipe.family_story) : ''}</textarea>
        </div>

        <div id="rf-error" class="error-msg"></div>
        <div style="display:flex;gap:12px">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Recipe'}</button>
          <a href="#/family/${familyId}/recipes${isEdit ? '/' + recipe.id : ''}" class="btn btn-secondary">Cancel</a>
        </div>

        <input type="hidden" id="rf-family-id" value="${familyId}">
        ${isEdit ? `<input type="hidden" id="rf-recipe-id" value="${recipe.id}">` : ''}
      </form>`;
  },

  init(recipe) {
    // Photo upload handler
    document.getElementById('photo-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const preview = document.getElementById('photo-preview');
        preview.innerHTML = '<p class="placeholder">Uploading...</p>';
        this.photoUrl = await API.upload(file);
        preview.innerHTML = `<img src="${this.photoUrl}" alt="Recipe photo">`;
      } catch (err) {
        document.getElementById('photo-preview').innerHTML = `<p class="placeholder" style="color:var(--danger)">${err.message}</p>`;
      }
    });

    // Form submission
    document.getElementById('recipe-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const familyId = document.getElementById('rf-family-id').value;
      const recipeId = document.getElementById('rf-recipe-id')?.value;
      const errEl = document.getElementById('rf-error');
      errEl.textContent = '';

      const ingredients = [...document.querySelectorAll('#ingredients-list input')]
        .map(i => i.value.trim()).filter(Boolean);
      const instructions = [...document.querySelectorAll('#instructions-list textarea')]
        .map(t => t.value.trim()).filter(Boolean);
      const tagsRaw = document.getElementById('rf-tags').value;
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

      const body = {
        title: document.getElementById('rf-title').value,
        description: document.getElementById('rf-desc').value || null,
        category: document.getElementById('rf-category').value || null,
        prep_time: document.getElementById('rf-prep').value ? parseInt(document.getElementById('rf-prep').value) : null,
        cook_time: document.getElementById('rf-cook').value ? parseInt(document.getElementById('rf-cook').value) : null,
        servings: document.getElementById('rf-servings').value ? parseInt(document.getElementById('rf-servings').value) : null,
        ingredients,
        instructions,
        tags,
        photo: this.photoUrl,
        family_story: document.getElementById('rf-story').value || null,
        attributed_member_id: document.getElementById('rf-attributed').value ? parseInt(document.getElementById('rf-attributed').value) : null,
      };

      try {
        if (recipeId) {
          await API.put(`/api/families/${familyId}/recipes/${recipeId}`, body);
          location.hash = `#/family/${familyId}/recipes/${recipeId}`;
        } else {
          const created = await API.post(`/api/families/${familyId}/recipes`, body);
          location.hash = `#/family/${familyId}/recipes/${created.id}`;
        }
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  },

  addIngredient() {
    const list = document.getElementById('ingredients-list');
    const li = document.createElement('li');
    li.innerHTML = `<input type="text" placeholder="e.g. 1 tsp salt"><button type="button" class="remove-item" onclick="RecipeForm.removeItem(this)">&times;</button>`;
    list.appendChild(li);
    li.querySelector('input').focus();
  },

  addInstruction() {
    const list = document.getElementById('instructions-list');
    const count = list.children.length + 1;
    const li = document.createElement('li');
    li.innerHTML = `<textarea placeholder="Step ${count}..."></textarea><button type="button" class="remove-item" onclick="RecipeForm.removeItem(this)">&times;</button>`;
    list.appendChild(li);
    li.querySelector('textarea').focus();
  },

  removeItem(btn) {
    const li = btn.closest('li');
    const list = li.parentElement;
    if (list.children.length > 1) {
      li.remove();
    } else {
      const input = li.querySelector('input, textarea');
      if (input) input.value = '';
    }
  }
};
