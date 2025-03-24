console.log('Listings.js loaded');

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded in listings.js');
  // Check if user is authenticated
  checkAuthStatus().then(isAuthenticated => {
    if (isAuthenticated) {
      // Load listings
      loadListings();
      
      // Set up event listeners
      document.getElementById('save-quantity').addEventListener('click', updateQuantity);
    } else {
      // Redirect to login page
      window.location.href = '/';
      console.log('User not authenticated, redirecting to homepage');
    }
  }).catch(error => {
    console.error('Error checking authentication status:', error);
  });
});

// Function to load listings
async function loadListings() {
  try {
    const response = await fetch('/api/listings');
    const data = await response.json();
    
    // Hide loading indicator
    document.getElementById('loading').style.display = 'none';
    
    if (response.ok) {
      if (data.listings && data.listings.length > 0) {
        // Show listings container
        document.getElementById('listings-container').style.display = 'flex';
        
        // Render listings
        renderListings(data.listings);
      } else {
        // Show no listings message
        document.getElementById('no-listings').style.display = 'block';
      }
    } else {
      showAlert('Error loading listings: ' + data.error, 'danger');
    }
  } catch (error) {
    document.getElementById('loading').style.display = 'none';
    showAlert('Error loading listings. Please try again.', 'danger');
    console.error('Error loading listings:', error);
  }
}

// Function to render listings
function renderListings(listings) {
  const container = document.getElementById('listings-container');
  
  listings.forEach(listing => {
    const card = document.createElement('div');
    card.className = 'col-md-4';
    card.innerHTML = `
      <div class="card listing-card">
        <img src="${listing.imageUrl || 'https://placehold.co/300x200?text=No+Image'}" class="card-img-top listing-image" alt="${listing.title}">
        <div class="card-body">
          <h5 class="card-title">${listing.title}</h5>
          <p class="card-text">
            <strong>Price:</strong> $${listing.price || 'N/A'}<br>
            <strong>Quantity:</strong> ${listing.quantityAvailable || 0} available<br>
            <strong>Watchers:</strong> ${listing.watchCount || 0}
          </p>
          <div class="d-flex justify-content-between">
            <a href="${listing.viewItemURL}" target="_blank" class="btn btn-primary">View on eBay</a>
            <button class="btn btn-outline-secondary update-quantity" data-id="${listing.itemId}" data-title="${listing.title}" data-bs-toggle="modal" data-bs-target="#updateQuantityModal">
              Update Quantity
            </button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  
  // Add event listeners to update quantity buttons
  document.querySelectorAll('.update-quantity').forEach(button => {
    button.addEventListener('click', function() {
      document.getElementById('modal-item-id').value = this.getAttribute('data-id');
      document.getElementById('modal-item-title').textContent = this.getAttribute('data-title');
    });
  });
}

// Function to update quantity
async function updateQuantity() {
  const itemId = document.getElementById('modal-item-id').value;
  const quantity = document.getElementById('new-quantity').value;
  
  if (!itemId || !quantity) {
    showAlert('Item ID and quantity are required', 'danger');
    return;
  }
  
  try {
    const response = await fetch(`/api/listings/${itemId}/quantity`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ quantity })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('updateQuantityModal'));
      modal.hide();
      
      showAlert('Quantity updated successfully', 'success');
      
      // Reload listings after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showAlert('Error updating quantity: ' + data.error, 'danger');
    }
  } catch (error) {
    showAlert('Error updating quantity. Please try again.', 'danger');
    console.error('Error updating quantity:', error);
  }
}

// Function to show alert
function showAlert(message, type) {
  // Remove any existing alerts
  const existingAlerts = document.querySelectorAll('.alert-fixed');
  existingAlerts.forEach(alert => alert.remove());
  
  // Create new alert
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show alert-fixed`;
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  document.body.appendChild(alert);
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    const bsAlert = new bootstrap.Alert(alert);
    bsAlert.close();
  }, 5000);
}

// Add this function if it's not already defined in auth.js
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/status');
    const data = await response.json();
    
    if (data.authenticated) {
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking auth status:', error);
    return false;
  }
} 