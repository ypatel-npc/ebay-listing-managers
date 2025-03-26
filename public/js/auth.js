document.addEventListener('DOMContentLoaded', function() {
  // Check if user is already logged in
  checkAuthStatus();
  
  // Login button event listener
  document.getElementById('login-btn').addEventListener('click', login);
  
  // Logout button event listener
  if (document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').addEventListener('click', logout);
  }
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
      
      // Show environment indicator
      if (data.environment === 'sandbox') {
        document.body.classList.add('sandbox-mode');
        // Add a sandbox indicator to the navbar if it exists
        const navbar = document.querySelector('.navbar');
        if (navbar) {
          const indicator = document.createElement('div');
          indicator.className = 'sandbox-indicator';
          indicator.textContent = 'SANDBOX MODE';
          navbar.appendChild(indicator);
        }
      }
      
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
  const environment = document.querySelector('input[name="environment"]:checked').value;
  const tokenType = document.querySelector('input[name="token-type"]:checked').value;
  
  if (!token) {
    alert('Please enter your eBay token');
    return;
  }
  
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        token,
        environment,
        tokenType
      })
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