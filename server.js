const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config');

// Import routes
const authRoutes = require('./routes/auth');
const listingsRoutes = require('./routes/listings');
const inventoryRoutes = require('./routes/inventory');

// Create Express app
const app = express();

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'ebay-listing-manager-session' // Add a specific name
}));

// Add middleware to log session on each request
app.use((req, res, next) => {
  console.log('Request path:', req.path);
  console.log('Session exists:', !!req.session);
  console.log('Auth token exists:', !!req.session.authToken);
  next();
});

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/inventory', inventoryRoutes);

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a specific route for listings.html to debug
app.get('/listings.html', (req, res) => {
  if (!req.session.authToken) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'listings.html'));
});

app.get('/create.html', (req, res) => {
  console.log('Create.html requested, auth token:', !!req.session.authToken);
  
  if (!req.session.authToken) {
    console.log('No auth token, redirecting to home');
    return res.redirect('/');
  }
  
  const filePath = path.join(__dirname, 'public', 'create.html');
  console.log('Serving file:', filePath);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error sending file:', err);
      res.status(err.status || 500).end();
    } else {
      console.log('File sent successfully');
    }
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
}); 