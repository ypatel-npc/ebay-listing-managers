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
  if (!confirm('Make sure your CSV includes these required fields:\n\n• title\n• description\n• price\n• quantity\n• category_id\n• location\n\nContinue with upload?')) {
    return;
  }
  
  // Create form data
  const formData = new FormData();
  formData.append('csvFile', file);
  
  try {
    // Show loading state
    document.getElementById('upload-spinner').classList.remove('d-none');
    document.getElementById('upload-btn').disabled = true;
    
    // Upload the file
    const response = await fetch('/api/bulk/upload', {
      method: 'POST',
      body: formData
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
      // Even if there's an error in the response, check if processing has started
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
      } else {
        showAlert(data?.error || 'Error uploading CSV file', 'danger');
      }
    }
  } catch (error) {
    document.getElementById('upload-spinner').classList.add('d-none');
    document.getElementById('upload-btn').disabled = false;
    
    console.error('Error uploading CSV:', error);
    
    // Check if processing has started despite the error
    try {
      const statusCheck = await fetch('/api/bulk/status');
      const statusData = await statusCheck.json();
      
      if (statusData.totalCount > 0) {
        // Processing has started despite the error
        showAlert('Processing has started despite upload error. Monitoring progress...', 'warning');
        
        // Hide upload form and show status
        document.getElementById('upload-form').style.display = 'none';
        document.getElementById('processing-status').style.display = 'block';
        
        // Start checking status
        checkStatusPeriodically();
      } else {
        showAlert('Error uploading CSV file. Please try again.', 'danger');
      }
    } catch (statusError) {
      showAlert('Error uploading CSV file. Please try again.', 'danger');
    }
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
      return data.pendingCount === 0 && total > 0;
    } else {
      showAlert('Error checking status', 'danger');
      return false;
    }
  } catch (error) {
    showAlert('Error checking status. Please try again.', 'danger');
    console.error('Error checking status:', error);
    return false;
  }
}

// Function to display error logs with more detailed information
function displayErrorLogs(failedItems) {
  // Create or update error log section
  let errorLogSection = document.getElementById('error-log-section');
  
  if (!errorLogSection) {
    // Create the section if it doesn't exist
    errorLogSection = document.createElement('div');
    errorLogSection.id = 'error-log-section';
    errorLogSection.className = 'mt-4';
    
    const heading = document.createElement('h5');
    heading.textContent = 'Error Logs';
    errorLogSection.appendChild(heading);
    
    // Add common error solutions
    const commonErrorsDiv = document.createElement('div');
    commonErrorsDiv.className = 'alert alert-warning mb-3';
    commonErrorsDiv.innerHTML = `
      <h6>Common Error Solutions:</h6>
      <ul>
        <li><strong>Missing Location:</strong> Make sure your CSV includes a "location" column (e.g., "United States")</li>
        <li><strong>OutOfStockControl:</strong> This feature is no longer supported. Set quantity to 0 instead.</li>
        <li><strong>Invalid Category:</strong> Verify that your category_id is valid for eBay listings</li>
      </ul>
    `;
    errorLogSection.appendChild(commonErrorsDiv);
    
    const errorLogContainer = document.createElement('div');
    errorLogContainer.id = 'error-log-container';
    errorLogContainer.className = 'border rounded p-3 bg-light';
    errorLogContainer.style.maxHeight = '300px';
    errorLogContainer.style.overflowY = 'auto';
    errorLogSection.appendChild(errorLogContainer);
    
    // Add the section to the page
    document.getElementById('processing-status').appendChild(errorLogSection);
  }
  
  // Get the container for error logs
  const errorLogContainer = document.getElementById('error-log-container');
  
  // Clear previous content
  errorLogContainer.innerHTML = '';
  
  // Add each failed item to the log
  failedItems.forEach((item, index) => {
    const errorCard = document.createElement('div');
    errorCard.className = 'card mb-2 border-danger';
    
    const errorCardBody = document.createElement('div');
    errorCardBody.className = 'card-body p-3';
    
    // Create error content
    let errorContent = `
      <h6 class="card-title text-danger">Error #${index + 1}: ${item.title || 'Unknown Item'}</h6>
      <p class="mb-1"><strong>Row:</strong> ${item.rowNumber || 'N/A'}</p>
    `;
    
    // Add SKU information if available
    if (item.sku) {
      errorContent += `<p class="mb-1"><strong>SKU:</strong> ${item.sku}</p>`;
    }
    
    // Add error message with highlighting for common issues
    let errorMessage = item.error || 'Unknown error';
    
    // Highlight common errors
    if (errorMessage.includes('Location')) {
      errorMessage = errorMessage.replace(/No <Item\.Location>.*request\./g, 
        '<span class="text-danger fw-bold">No Item Location exists. Add a "location" column to your CSV.</span>');
    }
    
    if (errorMessage.includes('OutOfStockControl')) {
      errorMessage = errorMessage.replace(/The input object.*ignored\./g, 
        '<span class="text-danger fw-bold">OutOfStockControl is no longer supported. Use quantity=0 instead.</span>');
    }
    
    errorContent += `<p class="mb-1"><strong>Error:</strong> ${errorMessage}</p>`;
    
    // Add details if available
    if (item.details && item.details.length > 0) {
      errorContent += '<p class="mb-1"><strong>Details:</strong></p><ul class="mb-0">';
      item.details.forEach(detail => {
        errorContent += `<li>${detail.message || ''}: ${detail.details || ''}</li>`;
      });
      errorContent += '</ul>';
    }
    
    // Add missing fields section
    const missingFields = [];
    if (!item.location) missingFields.push('location');
    if (missingFields.length > 0) {
      errorContent += `
        <div class="alert alert-warning mt-2 mb-0 py-2">
          <small><strong>Missing required fields:</strong> ${missingFields.join(', ')}</small>
        </div>
      `;
    }
    
    // Add raw data if available (for debugging)
    if (item.rawData) {
      errorContent += `
        <div class="mt-2">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#rawData${index}">
            Show Raw Data
          </button>
          <div class="collapse mt-2" id="rawData${index}">
            <div class="card card-body">
              <pre class="mb-0" style="font-size: 0.8rem;">${JSON.stringify(item.rawData, null, 2)}</pre>
            </div>
          </div>
        </div>
      `;
    }
    
    errorCardBody.innerHTML = errorContent;
    errorCard.appendChild(errorCardBody);
    errorLogContainer.appendChild(errorCard);
  });
  
  // Add a download button for error logs
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-outline-secondary mt-2';
  downloadBtn.textContent = 'Download Error Log';
  downloadBtn.addEventListener('click', () => downloadErrorLog(failedItems));
  errorLogSection.appendChild(downloadBtn);
}

// Function to download error log as JSON file
function downloadErrorLog(failedItems) {
  const dataStr = JSON.stringify(failedItems, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'bulk-upload-errors.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// Function to show alert
function showAlert(message, type = 'info') {
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

// Function to display a generic error log when detailed data isn't available
function displayGenericErrorLog(failedCount) {
  // Create or update error log section
  let errorLogSection = document.getElementById('error-log-section');
  
  if (!errorLogSection) {
    // Create the section if it doesn't exist
    errorLogSection = document.createElement('div');
    errorLogSection.id = 'error-log-section';
    errorLogSection.className = 'mt-4';
    
    const heading = document.createElement('h5');
    heading.textContent = 'Error Logs';
    errorLogSection.appendChild(heading);
    
    const errorLogContainer = document.createElement('div');
    errorLogContainer.id = 'error-log-container';
    errorLogContainer.className = 'border rounded p-3 bg-light';
    errorLogContainer.style.maxHeight = '300px';
    errorLogContainer.style.overflowY = 'auto';
    errorLogSection.appendChild(errorLogContainer);
    
    // Add the section to the page
    document.getElementById('processing-status').appendChild(errorLogSection);
  }
  
  // Get the container for error logs
  const errorLogContainer = document.getElementById('error-log-container');
  
  // Clear previous content
  errorLogContainer.innerHTML = '';
  
  // Add error card based on server logs
  const errorCard = document.createElement('div');
  errorCard.className = 'card mb-2 border-danger';
  
  const errorCardBody = document.createElement('div');
  errorCardBody.className = 'card-body p-3';
  
  // Create error content with specific issues from server logs
  errorCardBody.innerHTML = `
    <h6 class="card-title text-danger">Upload Failed: ${failedCount} items could not be processed</h6>
    
    <div class="alert alert-danger mb-3">
      <h6 class="alert-heading">Error Details from Server Logs:</h6>
      <p class="mb-1"><strong>Error 1:</strong> No &lt;Item.Location&gt; exists or &lt;Item.Location&gt; is specified as an empty tag in the request.</p>
      <p class="mb-1"><strong>Error 2:</strong> The input object "AddItemRequest.Item.OutOfStockControl" is no longer supported and will be ignored.</p>
    </div>
    
    <h6>How to Fix These Errors:</h6>
    <ol>
      <li class="mb-2">
        <strong>Missing Location Field:</strong>
        <ul>
          <li>Add a "location" column to your CSV file</li>
          <li>Fill in values like "United States" or your specific location</li>
          <li>This is a required field for all eBay listings</li>
        </ul>
      </li>
      <li class="mb-2">
        <strong>OutOfStockControl Issue:</strong>
        <ul>
          <li>This feature is no longer supported by eBay's API</li>
          <li>Instead, set quantity to 0 for out-of-stock items</li>
        </ul>
      </li>
    </ol>
    
    <div class="alert alert-info mt-3">
      <p class="mb-0">Please download our updated sample CSV file below which includes the required location field.</p>
    </div>
  `;
  
  errorCard.appendChild(errorCardBody);
  errorLogContainer.appendChild(errorCard);
  
  // Add buttons for actions
  const buttonDiv = document.createElement('div');
  buttonDiv.className = 'mt-3';
  
  // Add a button to download the sample CSV
  const sampleBtn = document.createElement('a');
  sampleBtn.className = 'btn btn-primary me-2';
  sampleBtn.textContent = 'Download Sample CSV';
  sampleBtn.href = '/sample-bulk-upload.csv';
  sampleBtn.download = 'sample-bulk-upload.csv';
  buttonDiv.appendChild(sampleBtn);
  
  // Add a button to try again
  const tryAgainBtn = document.createElement('a');
  tryAgainBtn.className = 'btn btn-outline-secondary';
  tryAgainBtn.textContent = 'Try Again';
  tryAgainBtn.href = '/bulk.html';
  buttonDiv.appendChild(tryAgainBtn);
  
  errorLogSection.appendChild(buttonDiv);
}

// Function to check status periodically
function checkStatusPeriodically() {
  console.log('Starting periodic status checks...');
  
  // Check status immediately
  checkStatus();
  
  // Set up interval to check status every 5 seconds
  const statusInterval = setInterval(async () => {
    console.log('Checking status...');
    const isComplete = await checkStatus();
    
    // If all items are processed, stop checking
    if (isComplete) {
      console.log('Processing complete, stopping status checks');
      clearInterval(statusInterval);
      showAlert('Bulk upload processing complete!', 'success');
    }
  }, 5000);
  
  // Store the interval ID in a data attribute so it can be cleared if needed
  document.getElementById('processing-status').dataset.statusInterval = statusInterval;
} 