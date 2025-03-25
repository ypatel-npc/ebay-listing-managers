console.log('Create.js loaded');

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded in create.js');
  // Check if user is authenticated
  checkAuthStatus().then(isAuthenticated => {
    if (isAuthenticated) {
      console.log('User authenticated in create.js');
      // Set up event listeners
      document.getElementById('listing-form').addEventListener('submit', createListing);
      document.getElementById('search-category-btn').addEventListener('click', searchCategories);
      document.getElementById('category').addEventListener('change', loadConditions);
      document.getElementById('create-another').addEventListener('click', resetForm);
      
      // Handle out of stock control checkbox
      document.getElementById('out-of-stock-control').addEventListener('change', function() {
        const quantityField = document.getElementById('quantity');
        if (this.checked) {
          quantityField.value = '0';
          quantityField.disabled = true;
        } else {
          quantityField.value = '1';
          quantityField.disabled = false;
        }
      });
    } else {
      // Redirect to login page
      console.log('User not authenticated in create.js, redirecting to homepage');
      window.location.href = '/';
    }
  }).catch(error => {
    console.error('Error checking authentication status in create.js:', error);
  });
});

// Function to load conditions for selected category
async function loadConditions() {
  const categoryId = document.getElementById('category').value.trim();
  
  if (!categoryId) {
    showAlert('Please enter a valid category ID', 'warning');
    return;
  }
  
  try {
    document.getElementById('condition-spinner').classList.remove('d-none');
    
    const response = await fetch(`/api/inventory/conditions/${categoryId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Error loading conditions');
    }
    
    const conditionSelect = document.getElementById('condition');
    conditionSelect.innerHTML = '<option value="">Select condition</option>';
    
    data.conditions.forEach(condition => {
      const option = document.createElement('option');
      option.value = condition.ID;
      option.textContent = condition.DisplayName;
      conditionSelect.appendChild(option);
    });
    
    document.getElementById('condition-spinner').classList.add('d-none');
    document.getElementById('condition-group').classList.remove('d-none');
  } catch (error) {
    document.getElementById('condition-spinner').classList.add('d-none');
    showAlert('Error loading conditions. Please check if the category ID is valid.', 'danger');
    console.error('Error loading conditions:', error);
  }
}

// Function to create a listing
async function createListing(event) {
  event.preventDefault();
  
  try {
    // Show spinner
    const submitBtn = document.getElementById('submit-btn');
    const spinner = document.getElementById('submit-spinner');
    submitBtn.disabled = true;
    spinner.classList.remove('d-none');
    
    // Get form values safely with optional chaining and default values
    const title = document.getElementById('title')?.value?.trim() || '';
    const description = document.getElementById('description')?.value?.trim() || '';
    const categoryId = document.getElementById('category')?.value || '';
    const price = document.getElementById('price')?.value?.trim() || '';
    const quantity = document.getElementById('quantity')?.value?.trim() || '1';
    const conditionId = document.getElementById('condition')?.value || '';
    const brand = document.getElementById('brand')?.value?.trim() || '';
    const mpn = document.getElementById('mpn')?.value?.trim() || '';
    const model = document.getElementById('model')?.value?.trim() || '';
    const color = document.getElementById('color')?.value?.trim() || '';
    const storageCapacity = document.getElementById('storage-capacity')?.value?.trim() || '';
    const type = document.getElementById('type')?.value?.trim() || '';
    const imageUrl = document.getElementById('image-url')?.value?.trim() || '';
    const outOfStockControl = document.getElementById('out-of-stock-control')?.checked || false;
    
    // Validate required fields
    if (!title || !description || !categoryId || !price || !conditionId || !imageUrl) {
      throw new Error('Please fill in all required fields');
    }
    
    // Create request body
    const requestBody = {
      title,
      description,
      categoryId,
      price,
      quantity,
      conditionId,
      itemSpecifics: {
        brand,
        mpn,
        model,
        color,
        storageCapacity,
        type
      },
      imageUrl,
      outOfStockControl
    };
    
    console.log('Submitting listing with data:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('/api/listings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    // Hide spinner
    submitBtn.disabled = false;
    spinner.classList.add('d-none');
    
    if (response.ok) {
      // Show success message
      document.getElementById('listing-form').style.display = 'none';
      document.getElementById('success-message').style.display = 'block';
      
      // Set listing details
      document.getElementById('listing-details').innerHTML = `
        <p><strong>Item ID:</strong> ${data.itemId}</p>
        <p><strong>Title:</strong> ${title}</p>
        <p><strong>Price:</strong> $${price}</p>
      `;
      
      // Set view on eBay link
      document.getElementById('view-on-ebay').href = `https://www.ebay.com/itm/${data.itemId}`;
    } else {
      // Show error message
      let errorMessage = 'Failed to create listing: ' + (data.error || 'Unknown error');
      
      if (data.details && data.details.length > 0) {
        errorMessage += ':<ul>' + data.details.map(error => 
          `<li>${error.message}: ${error.details}</li>`
        ).join('') + '</ul>';
      }
      
      showAlert(errorMessage, 'danger', true);
    }
  } catch (error) {
    console.error('Error in createListing:', error);
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-spinner').classList.add('d-none');
    showAlert('Error creating listing: ' + error.message, 'danger');
  }
}

// Function to reset the form
function resetForm() {
  document.getElementById('listing-form').reset();
  document.getElementById('listing-form').style.display = 'block';
  document.getElementById('success-message').style.display = 'none';
  document.getElementById('quantity').disabled = false;
}

// Function to show alert
function showAlert(message, type, isHtml = false) {
  // Remove any existing alerts
  const existingAlerts = document.querySelectorAll('.alert-fixed');
  existingAlerts.forEach(alert => alert.remove());
  
  // Create new alert
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show alert-fixed`;
  
  if (isHtml) {
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
  } else {
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
  }
  
  document.body.appendChild(alert);
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    const bsAlert = new bootstrap.Alert(alert);
    bsAlert.close();
  }, 5000);
}

// Add this function if it's not already defined in auth.js and not imported
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