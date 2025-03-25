const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config');

// Import routes
const authRoutes = require('./routes/auth');
const listingsRoutes = require('./routes/listings');
const inventoryRoutes = require('./routes/inventory');
const bulkRoutes = require('./routes/bulk');

// Create Express app
const app = express();

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Add middleware to log session on each request
app.use((req, res, next) => {
  console.log('Request path:', req.path);
  console.log('Session exists:', !!req.session);
  console.log('Auth token exists:', !!req.session.authToken);
  next();
});

// Root route handler
app.get('/', (req, res) => {
  if (req.session && req.session.authToken) {
    res.redirect('/listings.html');
  } else {
    res.redirect('/index.html');
  }
});

// Register API routes BEFORE static file middleware
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/bulk', bulkRoutes);

// Serve static files AFTER API routes
app.use(express.static(path.join(__dirname, 'public')));

// Add a catch-all route handler for HTML pages that require authentication
app.get(['*/create.html', '*/listings.html', '*/bulk.html'], (req, res, next) => {
  console.log('Protected page requested:', req.path);
  console.log('Auth token present:', !!req.session.authToken);
  
  if (!req.session.authToken) {
    console.log('No auth token, redirecting to home');
    return res.redirect('/');
  }
  
  // If authenticated, continue to serve the static file
  next();
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
}); 