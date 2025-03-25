const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');

// Check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.authToken) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Route to get Auth'n'Auth token
router.post('/token', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  // Store token in session
  req.session.authToken = token;
  
  // Verify token by making a simple API call
  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'GetUser',
        'X-EBAY-API-SITEID': '0',
      },
      data: `<?xml version="1.0" encoding="utf-8"?>
      <GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${token}</eBayAuthToken>
        </RequesterCredentials>
      </GetUserRequest>`
    });
    
    // Parse XML response
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    if (result.GetUserResponse.Ack === 'Success' || result.GetUserResponse.Ack === 'Warning') {
      const userData = {
        userId: result.GetUserResponse.User.UserID,
        email: result.GetUserResponse.User.Email,
        status: result.GetUserResponse.User.Status
      };
      
      // Store user data in session
      req.session.userData = userData;
      
      return res.json({ success: true, user: userData });
    } else {
      req.session.authToken = null;
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    req.session.authToken = null;
    return res.status(500).json({ error: 'Error verifying token', details: error.message });
  }
});

// Route to check authentication status
router.get('/status', (req, res) => {
  console.log('Auth status requested');
  console.log('Session:', req.session);
  console.log('Auth token present:', !!req.session.authToken);
  
  if (req.session && req.session.authToken && req.session.userData) {
    console.log('User is authenticated, returning user data');
    return res.json({
      authenticated: true,
      user: req.session.userData
    });
  } else {
    console.log('User is not authenticated');
    return res.json({
      authenticated: false
    });
  }
});

// Route to logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Export the router and middleware
module.exports = router;
module.exports.isAuthenticated = isAuthenticated; 