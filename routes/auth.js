const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');
const fs = require('fs');
const path = require('path');

// Token storage file
const TOKEN_FILE = path.join(__dirname, '../tokens.json');

// Check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.authToken) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// Load tokens from file
function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = fs.readFileSync(TOKEN_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tokens:', error);
  }
  return {};
}

// Save tokens to file
function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  } catch (error) {
    console.error('Error saving tokens:', error);
  }
}

// Initialize tokens on server start
let storedTokens = loadTokens();

// Route to get stored tokens
router.get('/stored-tokens', (req, res) => {
  const tokens = loadTokens();
  const tokenList = Object.keys(tokens).map(env => ({
    environment: env,
    type: tokens[env].type,
    userId: tokens[env].userData?.userId || 'Unknown',
    expiresAt: tokens[env].expiresAt || 'Never'
  }));
  
  res.json({ tokens: tokenList });
});

// Route to use a stored token
router.post('/use-stored-token', async (req, res) => {
  const { environment } = req.body;
  
  if (!environment) {
    return res.status(400).json({ error: 'Environment is required' });
  }
  
  const tokens = loadTokens();
  const storedToken = tokens[environment];
  
  if (!storedToken || !storedToken.token) {
    return res.status(404).json({ error: 'No token found for this environment' });
  }
  
  // Check if OAuth token needs refresh
  if (storedToken.type === 'oauth' && storedToken.refreshToken) {
    const now = new Date();
    const expiresAt = new Date(storedToken.expiresAt);
    
    // If token expires in less than 5 minutes, refresh it
    if (expiresAt - now < 5 * 60 * 1000) {
      try {
        const refreshed = await refreshOAuthToken(environment, storedToken.refreshToken);
        if (refreshed) {
          // Update stored token
          tokens[environment] = {
            ...storedToken,
            token: refreshed.access_token,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          };
          saveTokens(tokens);
          storedToken.token = refreshed.access_token;
        }
      } catch (error) {
        console.error('Error refreshing token:', error);
      }
    }
  }
  
  // Store token in session
  req.session.authToken = storedToken.token;
  req.session.environment = environment;
  req.session.tokenType = storedToken.type;
  req.session.userData = storedToken.userData;
  
  return res.json({ 
    success: true, 
    user: storedToken.userData,
    environment: environment
  });
});

// Function to refresh OAuth token
async function refreshOAuthToken(environment, refreshToken) {
  try {
    const tokenUrl = environment === 'sandbox' 
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token' 
      : 'https://api.ebay.com/identity/v1/oauth2/token';
    
    const response = await axios({
      method: 'post',
      url: tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
      },
      data: `grant_type=refresh_token&refresh_token=${refreshToken}&scope=https://api.ebay.com/oauth/api_scope`
    });
    
    return response.data;
  } catch (error) {
    console.error('Error refreshing OAuth token:', error);
    return null;
  }
}

// Route to save token
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
    let tokenData = { token, type: tokenType };
    
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
      
      // For OAuth, store expiration time (assuming 2 hours from now)
      tokenData.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      
      // If this is a full OAuth response with refresh token
      if (req.body.refreshToken) {
        tokenData.refreshToken = req.body.refreshToken;
      }
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
    
    // Save token to file
    tokenData.userData = userData;
    storedTokens[environment] = tokenData;
    saveTokens(storedTokens);
    
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
router.get('/status', async (req, res) => {
  console.log('Auth status requested');
  console.log('Session:', req.session);
  console.log('Auth token present:', !!req.session.authToken);
  
  // Check if token needs refreshing
  if (req.session && req.session.tokenType === 'oauth' && req.session.refreshToken) {
    const now = Date.now();
    const tokenExpires = req.session.tokenExpires || 0;
    
    // If token expires in less than 5 minutes, refresh it
    if (tokenExpires - now < 5 * 60 * 1000) {
      try {
        const refreshed = await refreshOAuthToken(req.session.environment, req.session.refreshToken);
        if (refreshed) {
          req.session.authToken = refreshed.access_token;
          req.session.tokenExpires = Date.now() + (refreshed.expires_in * 1000);
          
          // Update stored token
          const tokens = loadTokens();
          if (tokens[req.session.environment]) {
            tokens[req.session.environment].token = refreshed.access_token;
            tokens[req.session.environment].expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
            saveTokens(tokens);
          }
          console.log('Token refreshed successfully');
        }
      } catch (error) {
        console.error('Error refreshing token:', error);
      }
    }
  }
  
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

// Add this function to your existing routes/auth.js
// This initiates the OAuth flow
router.get('/initiate-oauth', (req, res) => {
  const { environment } = req.query;
  const isProduction = environment !== 'sandbox';
  
  // Store the environment in session for the callback
  req.session.oauthEnvironment = environment || 'production';
  
  // Determine the correct OAuth URLs based on environment
  const authUrl = isProduction
    ? 'https://auth.ebay.com/oauth2/authorize'
    : 'https://auth.sandbox.ebay.com/oauth2/authorize';
  
  // Use the appropriate credentials based on environment
  const clientId = isProduction ? config.clientId : config.sandboxClientId;
  const ruName = isProduction ? config.ruName : config.sandboxRuName;
  
  // Construct the authorization URL
  const redirectUrl = `${authUrl}?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(ruName)}&scope=https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment`;
  
  // Redirect the user to eBay's authorization page
  res.redirect(redirectUrl);
});

// Add this route to handle the OAuth callback
router.get('/oauth-callback', async (req, res) => {
  const { code } = req.query;
  const environment = req.session.oauthEnvironment || 'production';
  const isProduction = environment !== 'sandbox';
  
  if (!code) {
    return res.redirect('/?error=No authorization code received');
  }
  
  try {
    // Determine the correct token URL based on environment
    const tokenUrl = isProduction
      ? 'https://api.ebay.com/identity/v1/oauth2/token'
      : 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
    
    // Use the appropriate credentials based on environment
    const clientId = isProduction ? config.clientId : config.sandboxClientId;
    const clientSecret = isProduction ? config.clientSecret : config.sandboxClientSecret;
    const ruName = isProduction ? config.ruName : config.sandboxRuName;
    
    // Exchange the code for tokens
    const response = await axios({
      method: 'post',
      url: tokenUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      data: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(ruName)}`
    });
    
    const { access_token, refresh_token, expires_in } = response.data;
    
    // Store the tokens in session
    req.session.authToken = access_token;
    req.session.refreshToken = refresh_token;
    req.session.tokenExpires = Date.now() + (expires_in * 1000);
    req.session.environment = environment;
    req.session.tokenType = 'oauth';
    
    // Get user info
    const userInfoUrl = isProduction
      ? 'https://api.ebay.com/identity/v1/oauth2/userinfo'
      : 'https://api.sandbox.ebay.com/identity/v1/oauth2/userinfo';
    
    const userResponse = await axios({
      method: 'get',
      url: userInfoUrl,
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const userData = {
      userId: userResponse.data.username,
      email: userResponse.data.email || 'Not available',
      status: 'Active'
    };
    
    // Store user data in session
    req.session.userData = userData;
    
    // Save token to file for future use
    const tokens = loadTokens();
    tokens[environment] = {
      token: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
      type: 'oauth',
      userData
    };
    saveTokens(tokens);
    
    // Redirect to the dashboard
    res.redirect('/listings.html');
  } catch (error) {
    console.error('OAuth error:', error);
    res.redirect(`/?error=${encodeURIComponent('Failed to authenticate with eBay')}`);
  }
});

// Export the router and middleware
module.exports = router;
module.exports.isAuthenticated = isAuthenticated; 