document.addEventListener('DOMContentLoaded', function() {
  // Check if user is already logged in
  checkAuthStatus();
  
  // Login button event listener
  document.getElementById('login-btn').addEventListener('click', login);
  
  // Logout button event listener
  if (document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').addEventListener('click', logout);
  }
  
  // Load stored tokens
  loadStoredTokens();
});

// Function to check authentication status
async function checkAuthStatus() {
  try {
    console.log('Checking auth status...');
    const response = await fetch('/api/auth/status');
    console.log('Auth status response:', response.status);
    
    const data = await response.json();
    console.log('Auth status data:', data);
    
    if (data.authenticated) {
      // Store user data globally
      window.userData = data.user;
      
      // Show dashboard elements
      if (document.getElementById('dashboard')) {
        document.getElementById('dashboard').style.display = 'block';
      }
      if (document.getElementById('user-id')) {
        document.getElementById('user-id').textContent = data.user.userId;
      }
      if (document.getElementById('logout-btn')) {
        document.getElementById('logout-btn').style.display = 'block';
      }
      
      return true;
    } else {
      // User is not authenticated
      if (document.getElementById('login-form')) {
        document.getElementById('login-form').style.display = 'block';
      }
      if (document.getElementById('dashboard')) {
        document.getElementById('dashboard').style.display = 'none';
      }
      
      return false;
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    return false;
  }
}

// Function to login
async function login() {
  const token = document.getElementById('auth-token').value.trim();
  
  if (!token) {
    alert('Please enter your eBay Auth\'n\'Auth token');
    return;
  }
  
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showDashboard(data.user);
    } else {
      alert(`Login failed: ${data.error}`);
    }
  } catch (error) {
    console.error('Error logging in:', error);
    alert('An error occurred while logging in. Please try again.');
  }
}

// Function to logout
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (error) {
    console.error('Error logging out:', error);
  }
}

// Function to show dashboard
function showDashboard(user) {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('user-id').textContent = user.userId;
}

// Function to load stored tokens
async function loadStoredTokens() {
  try {
    const response = await fetch('/api/auth/stored-tokens');
    const data = await response.json();
    
    const tokensList = document.getElementById('stored-tokens-list');
    
    if (data.tokens && data.tokens.length > 0) {
      tokensList.innerHTML = '';
      
      data.tokens.forEach(token => {
        const tokenItem = document.createElement('button');
        tokenItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        tokenItem.innerHTML = `
          <div>
            <strong>${token.userId}</strong> 
            <span class="badge bg-${token.environment === 'production' ? 'primary' : 'warning'} ms-2">
              ${token.environment}
            </span>
            <span class="badge bg-secondary ms-2">${token.type}</span>
          </div>
          <span>Use</span>
        `;
        
        tokenItem.addEventListener('click', () => useStoredToken(token.environment));
        tokensList.appendChild(tokenItem);
      });
    } else {
      tokensList.innerHTML = '<div class="list-group-item text-center">No stored tokens found</div>';
    }
  } catch (error) {
    console.error('Error loading stored tokens:', error);
    document.getElementById('stored-tokens-list').innerHTML = 
      '<div class="list-group-item text-danger">Error loading stored tokens</div>';
  }
}

// Function to use a stored token
async function useStoredToken(environment) {
  try {
    const response = await fetch('/api/auth/use-stored-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ environment })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showDashboard(data.user);
    } else {
      alert(`Login failed: ${data.error}`);
    }
  } catch (error) {
    console.error('Error using stored token:', error);
    alert('An error occurred while logging in. Please try again.');
  }
} 