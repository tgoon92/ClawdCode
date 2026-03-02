// Single Recipe View
Router.on('/family/:id/recipes/:rid', async ({ id, rid }) => {
  try {
    const recipe = await API.get(`/api/families/${id}/recipes/${rid}`);
    const user = API.getUser();
    const isAuthor = user && user.id === recipe.author_id;

    let ingredients = [];
    let instructions = [];
    try { ingredients = JSON.parse(recipe.ingredients); } catch {}
    try { instructions = JSON.parse(recipe.instructions); } catch {}

    const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

    let html = `
      <div class="page-header">
        <h1>${Router.escapeHtml(recipe.title)}</h1>
        <div style="display:flex;gap:8px">
          ${isAuthor ? `
            <a href="#/family/${id}/recipes/${rid}/edit" class="btn btn-secondary">Edit</a>
            <button class="btn btn-danger" onclick="RecipeDetail.deleteRecipe(${id}, ${rid})">Delete</button>
          ` : ''}
          <a href="#/family/${id}/recipes" class="btn btn-secondary">Back to Recipes</a>
        </div>
      </div>`;

    if (recipe.photo) {
      html += `<img class="recipe-hero" src="${recipe.photo}" alt="${Router.escapeHtml(recipe.title)}">`;
    }

    const attributedName = recipe.attributed_first_name
      ? recipe.attributed_first_name + (recipe.attributed_last_name ? ' ' + recipe.attributed_last_name : '')
      : null;

    html += `
      <div style="margin-bottom:20px">
        <span style="color:var(--text-light);font-family:-apple-system,sans-serif;font-size:0.9rem">
          by ${Router.escapeHtml(recipe.author_name)}
          ${attributedName ? ` &middot; From <a href="#/family/${id}/members/${recipe.attributed_member_id}" style="color:var(--terracotta)">${Router.escapeHtml(attributedName)}</a>` : ''}
          ${recipe.category ? ' &middot; ' + Router.escapeHtml(recipe.category) : ''}
          &middot; Added ${new Date(recipe.created_at).toLocaleDateString()}
        </span>
        ${recipe.tags && recipe.tags.length > 0
          ? `<div style="margin-top:8px">${recipe.tags.map(t => `<span class="tag">${Router.escapeHtml(t)}</span>`).join(' ')}</div>`
          : ''
        }
      </div>`;

    if (recipe.description) {
      html += `<p style="margin-bottom:20px;font-size:1.05rem">${Router.escapeHtml(recipe.description)}</p>`;
    }

    // Meta cards
    if (recipe.prep_time || recipe.cook_time || recipe.servings) {
      html += '<div class="recipe-meta">';
      if (recipe.prep_time) html += `<div class="recipe-meta-item"><span class="value">${recipe.prep_time}</span><span class="label">Prep (min)</span></div>`;
      if (recipe.cook_time) html += `<div class="recipe-meta-item"><span class="value">${recipe.cook_time}</span><span class="label">Cook (min)</span></div>`;
      if (totalTime) html += `<div class="recipe-meta-item"><span class="value">${totalTime}</span><span class="label">Total (min)</span></div>`;
      if (recipe.servings) html += `<div class="recipe-meta-item"><span class="value">${recipe.servings}</span><span class="label">Servings</span></div>`;
      html += '</div>';
    }

    // Ingredients
    if (ingredients.length > 0) {
      html += `<div class="recipe-section"><h2>Ingredients</h2><ul class="ingredient-list">`;
      for (const ing of ingredients) {
        html += `<li>${Router.escapeHtml(ing)}</li>`;
      }
      html += '</ul></div>';
    }

    // Instructions
    if (instructions.length > 0) {
      html += `<div class="recipe-section"><h2>Instructions</h2><ol class="instruction-list">`;
      for (const step of instructions) {
        html += `<li><span>${Router.escapeHtml(step)}</span></li>`;
      }
      html += '</ol></div>';
    }

    // Family Story
    if (recipe.family_story) {
      html += `<div class="recipe-section"><h2>The Story Behind This Recipe</h2><div class="family-story">${Router.escapeHtml(recipe.family_story)}</div></div>`;
    }

    Router.content.innerHTML = html;
  } catch (e) {
    Router.content.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
});

const RecipeDetail = {
  async deleteRecipe(familyId, recipeId) {
    if (!confirm('Are you sure you want to delete this recipe? This cannot be undone.')) return;
    try {
      await API.del(`/api/families/${familyId}/recipes/${recipeId}`);
      location.hash = `#/family/${familyId}/recipes`;
    } catch (e) {
      alert(e.message);
    }
  }
};
