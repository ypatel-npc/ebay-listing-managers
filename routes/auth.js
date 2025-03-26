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
  const { token, environment, tokenType } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  // Store token and environment in session
  req.session.authToken = token;
  req.session.environment = environment || 'production';
  req.session.tokenType = tokenType || 'authnauth';
  
  // Determine API endpoint based on environment
  const apiEndpoint = environment === 'sandbox' 
    ? 'https://api.sandbox.ebay.com/ws/api.dll' 
    : 'https://api.ebay.com/ws/api.dll';
  
  // Verify token by making a simple API call
  try {
    let userData;
    
    if (tokenType === 'oauth') {
      // OAuth verification
      const oauthEndpoint = environment === 'sandbox'
        ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/userinfo'
        : 'https://api.ebay.com/identity/v1/oauth2/userinfo';
        
      const response = await axios({
        method: 'get',
        url: oauthEndpoint,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      userData = {
        userId: response.data.username,
        email: response.data.email || 'Not available',
        status: 'Active'
      };
    } else {
      // Auth'n'Auth verification
      const response = await axios({
        method: 'post',
        url: apiEndpoint,
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
        userData = {
          userId: result.GetUserResponse.User.UserID,
          email: result.GetUserResponse.User.Email,
          status: result.GetUserResponse.User.Status
        };
      } else {
        req.session.authToken = null;
        return res.status(401).json({ error: 'Invalid token' });
      }
    }
    
    // Store user data in session
    req.session.userData = userData;
    
    return res.json({ 
      success: true, 
      user: userData,
      environment: req.session.environment
    });
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
      user: req.session.userData,
      environment: req.session.environment || 'production',
      tokenType: req.session.tokenType || 'authnauth'
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