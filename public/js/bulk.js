console.log('Bulk.js loaded');

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded in bulk.js');
  // Check if user is authenticated
  checkAuthStatus().then(isAuthenticated => {
    if (isAuthenticated) {
      console.log('User authenticated in bulk.js');
      
      // Set up event listeners
      document.getElementById('bulk-upload-form').addEventListener('submit', uploadCSV);
      document.getElementById('refresh-status').addEventListener('click', checkStatus);
      
    } else {
      // Redirect to login page
      console.log('User not authenticated in bulk.js, redirecting to homepage');
      window.location.href = '/';
    }
  }).catch(error => {
    console.error('Error checking authentication status in bulk.js:', error);
  });
});

// Function to upload CSV
async function uploadCSV(event) {
  event.preventDefault();
  
  const fileInput = document.getElementById('csv-file');
  if (!fileInput.files.length) {
    showAlert('Please select a CSV file to upload', 'warning');
    return;
  }
  
  const file = fileInput.files[0];
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showAlert('Please select a valid CSV file', 'warning');
    return;
  }
  
  // Show a reminder about required fields
  if (!confirm('Make sure your CSV includes these required fields:\n\n• SKU\n• Localized For\n• title\n• description\n• Picture URL 1\n• Brand\n• Condition\n• Total Ship to Home Quantity\n• Category\n\nContinue with upload?')) {
    return;
  }
  
  // Create form data
  const formData = new FormData();
  formData.append('csvFile', file);
  formData.append('format', 'automotive'); // Add a flag to indicate this is the automotive format
  
  try {
    // Show loading state
    document.getElementById('upload-spinner').classList.remove('d-none');
    document.getElementById('upload-btn').disabled = true;
    
    // Upload the file
    const response = await fetch('/api/bulk/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'X-CSV-Format': 'automotive' // Additional header to indicate format
      }
    });
    
    // Hide loading state
    document.getElementById('upload-spinner').classList.add('d-none');
    document.getElementById('upload-btn').disabled = false;
    
    // Check if the response is valid JSON
    let data;
    try {
      data = await response.json();
    } catch (e) {
      console.log('Response is not valid JSON, but continuing with processing');
      // Even if we can't parse the response, we'll continue with processing
      // Hide upload form and show status
      document.getElementById('upload-form').style.display = 'none';
      document.getElementById('processing-status').style.display = 'block';
      
      // Start checking status
      checkStatusPeriodically();
      return;
    }
    
    if (response.ok) {
      // Show success message
      showAlert(`${data.message || 'CSV uploaded successfully.'} Processing will continue in the background.`, 'success');
      
      // Hide upload form and show status
      document.getElementById('upload-form').style.display = 'none';
      document.getElementById('processing-status').style.display = 'block';
      
      // Start checking status
      checkStatusPeriodically();
    } else {
      // Show the specific error message
      showAlert(data?.error || 'Error uploading CSV file', 'danger');
      
      // Even if there's an error in the response, check if processing has started
      try {
        const statusCheck = await fetch('/api/bulk/status');
        const statusData = await statusCheck.json();
        
        if (statusData.totalCount > 0) {
          // Processing has started despite the error
          showAlert('Processing has started despite response error. Monitoring progress...', 'warning');
          
          // Hide upload form and show status
          document.getElementById('upload-form').style.display = 'none';
          document.getElementById('processing-status').style.display = 'block';
          
          // Start checking status
          checkStatusPeriodically();
        }
      } catch (statusError) {
        console.error('Error checking status after upload error:', statusError);
      }
    }
  } catch (error) {
    document.getElementById('upload-spinner').classList.add('d-none');
    document.getElementById('upload-btn').disabled = false;
    
    console.error('Error uploading CSV:', error);
    showAlert('Error uploading CSV file. Please try again.', 'danger');
  }
}

// Function to check processing status
async function checkStatus() {
  try {
    console.log('Checking bulk upload status...');
    const response = await fetch('/api/bulk/status');
    const data = await response.json();
    console.log('Status response:', data);
    
    if (response.ok) {
      // Update status display
      document.getElementById('pending-count').textContent = data.pendingCount;
      document.getElementById('success-count').textContent = data.successCount;
      document.getElementById('failed-count').textContent = data.failedCount;
      
      // Calculate progress percentage
      const total = data.totalCount || 1; // Avoid division by zero
      const progress = Math.round(((data.successCount + data.failedCount) / total) * 100);
      
      // Update progress bar
      const progressBar = document.getElementById('progress-bar');
      progressBar.style.width = `${progress}%`;
      progressBar.textContent = `${progress}%`;
      
      // Display error logs if there are failures
      if (data.failedCount > 0 && data.failedItems && data.failedItems.length > 0) {
        displayErrorLogs(data.failedItems);
      }
      
      // If all items are processed, return true
      return (data.pendingCount === 0 && total > 0);
    } else {
      console.error('Error checking status:', data?.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('Error checking status:', error);
    return false;
  }
}

// Function to check status periodically
function checkStatusPeriodically() {
  // Check status immediately
  checkStatus().then(isComplete => {
    if (isComplete) {
      console.log('Processing complete');
      // Show completion message
      showAlert('Bulk upload processing complete!', 'success');
      // Stop checking
      return;
    }
    
    // Set up interval to check status every 5 seconds
    const statusInterval = setInterval(() => {
      checkStatus().then(isComplete => {
        if (isComplete) {
          console.log('Processing complete');
          // Show completion message
          showAlert('Bulk upload processing complete!', 'success');
          // Stop checking
          clearInterval(statusInterval);
        }
      }).catch(error => {
        console.error('Error in periodic status check:', error);
      });
    }, 5000);
  }).catch(error => {
    console.error('Error in initial status check:', error);
  });
}

// Function to display error logs
function displayErrorLogs(failedItems) {
  const errorLogSection = document.getElementById('error-logs');
  errorLogSection.innerHTML = ''; // Clear previous logs
  
  const heading = document.createElement('h4');
  heading.className = 'mt-4 mb-3';
  heading.textContent = 'Error Logs';
  errorLogSection.appendChild(heading);
  
  const accordion = document.createElement('div');
  accordion.className = 'accordion';
  accordion.id = 'errorAccordion';
  
  failedItems.forEach((item, index) => {
    const accordionItem = document.createElement('div');
    accordionItem.className = 'accordion-item';
    
    const header = document.createElement('h2');
    header.className = 'accordion-header';
    header.id = `heading${index}`;
    
    const button = document.createElement('button');
    button.className = 'accordion-button collapsed';
    button.type = 'button';
    button.setAttribute('data-bs-toggle', 'collapse');
    button.setAttribute('data-bs-target', `#collapse${index}`);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `collapse${index}`);
    
    // Use SKU and title for the header if available
    const itemTitle = item.data?.SKU ? 
      `${item.data.SKU} - ${item.data.title || 'No Title'}` : 
      `Item ${index + 1}`;
    
    button.innerHTML = `
      <div class="d-flex w-100 justify-content-between align-items-center">
        <span>${itemTitle}</span>
        <span class="badge bg-danger ms-2">${item.error}</span>
      </div>
    `;
    
    header.appendChild(button);
    accordionItem.appendChild(header);
    
    const collapseDiv = document.createElement('div');
    collapseDiv.id = `collapse${index}`;
    collapseDiv.className = 'accordion-collapse collapse';
    collapseDiv.setAttribute('aria-labelledby', `heading${index}`);
    collapseDiv.setAttribute('data-bs-parent', '#errorAccordion');
    
    const body = document.createElement('div');
    body.className = 'accordion-body';
    
    // Add error message
    const errorMessage = document.createElement('p');
    errorMessage.className = 'text-danger';
    errorMessage.textContent = item.error;
    body.appendChild(errorMessage);
    
    // Add item data if available
    if (item.data && Object.keys(item.data).length > 0) {
      const dataDetails = document.createElement('div');
      dataDetails.className = 'mt-3';
      
      const dataHeading = document.createElement('h6');
      dataHeading.textContent = 'Item Data:';
      dataDetails.appendChild(dataHeading);
      
      const dataList = document.createElement('ul');
      dataList.className = 'list-group';
      
      // Add each property of the item data
      Object.entries(item.data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          const listItem = document.createElement('li');
          listItem.className = 'list-group-item d-flex justify-content-between align-items-start';
          
          const keySpan = document.createElement('span');
          keySpan.className = 'fw-bold me-2';
          keySpan.textContent = key + ':';
          
          const valueSpan = document.createElement('span');
          valueSpan.className = 'text-break';
          valueSpan.style.maxWidth = '70%';
          valueSpan.textContent = value.toString().substring(0, 100) + (value.toString().length > 100 ? '...' : '');
          
          listItem.appendChild(keySpan);
          listItem.appendChild(valueSpan);
          dataList.appendChild(listItem);
        }
      });
      
      dataDetails.appendChild(dataList);
      body.appendChild(dataDetails);
    }
    
    collapseDiv.appendChild(body);
    accordionItem.appendChild(collapseDiv);
    
    accordion.appendChild(accordionItem);
  });
  
  errorLogSection.appendChild(accordion);
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