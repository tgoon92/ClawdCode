require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/families', require('./routes/families'));
app.use('/api/families', require('./routes/members'));
app.use('/api/families', require('./routes/recipes'));
app.use('/api/upload', require('./routes/uploads'));

// SPA fallback - serve app.html for /app route
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.listen(PORT, () => {
  console.log(`Family Tree Recipes running on http://localhost:${PORT}`);
});
