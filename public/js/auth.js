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
    console.log('Checking authentication status...');
    const response = await fetch('/api/auth/status');
    const data = await response.json();
    
    console.log('Auth status response:', data);
    
    if (data.authenticated) {
      console.log('User is authenticated');
      showDashboard(data.user);
      return true;
    }
    console.log('User is not authenticated');
    return false;
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