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
      document.getElementById('view-error-log').addEventListener('click', function() {
        const logContainer = document.getElementById('error-log-container');
        const logContent = document.getElementById('error-log');
        
        // Toggle visibility
        if (logContainer.style.display === 'none') {
          logContainer.style.display = 'block';
          
          // Fetch error log
          fetch('/api/bulk/error-log')
            .then(response => response.json())
            .then(data => {
              logContent.textContent = data.log || 'No errors logged.';
            })
            .catch(error => {
              logContent.textContent = 'Error loading log: ' + error.message;
            });
        } else {
          logContainer.style.display = 'none';
        }
      });
      
    } else {
      // Redirect to login page
      console.log('User not authenticated in bulk.js, redirecting to homepage');
      window.location.href = '/';
    }
  }).catch(error => {
    console.error('Error checking authentication status in bulk.js:', error);
  });
});

// Function to upload CSV file
async function uploadCSV(event) {
  event.preventDefault();
  
  const fileInput = document.getElementById('csv-file');
  if (!fileInput.files || fileInput.files.length === 0) {
    showAlert('Please select a CSV file', 'warning');
    return;
  }
  
  const file = fileInput.files[0];
  if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
    showAlert('Please select a valid CSV file', 'warning');
    return;
  }
  
  // Show spinner
  const uploadBtn = document.getElementById('upload-btn');
  const uploadSpinner = document.getElementById('upload-spinner');
  uploadBtn.disabled = true;
  uploadSpinner.classList.remove('d-none');
  
  try {
    const formData = new FormData();
    formData.append('csvFile', file);
    
    const response = await fetch('/api/bulk/upload', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Show processing status
      document.getElementById('upload-form').style.display = 'none';
      document.getElementById('processing-status').style.display = 'block';
      
      // Start checking status
      checkStatus();
      // Set up interval to check status every 5 seconds
      const statusInterval = setInterval(() => {
        checkStatus().then(isComplete => {
          if (isComplete) {
            clearInterval(statusInterval);
          }
        });
      }, 5000);
      
      showAlert(data.message, 'success');
    } else {
      showAlert('Error uploading file: ' + data.error, 'danger');
      // Reset button
      uploadBtn.disabled = false;
      uploadSpinner.classList.add('d-none');
    }
  } catch (error) {
    showAlert('Error uploading file. Please try again.', 'danger');
    console.error('Error uploading file:', error);
    // Reset button
    uploadBtn.disabled = false;
    uploadSpinner.classList.add('d-none');
  }
}

// Function to check processing status
async function checkStatus() {
  try {
    const response = await fetch('/api/bulk/status');
    const data = await response.json();
    
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

// Add this function to fetch and display logs
async function fetchLogs() {
  try {
    const response = await fetch('/api/bulk/logs');
    const data = await response.json();
    
    const logsTable = document.getElementById('logs-table').querySelector('tbody');
    
    if (data.logs && data.logs.length > 0) {
      // Clear existing rows
      logsTable.innerHTML = '';
      
      // Add log entries
      data.logs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${log.timestamp}</td>
          <td>${log.size}</td>
          <td>
            <a href="${log.path}" class="btn btn-sm btn-outline-primary" download>
              <i class="bi bi-download"></i> Download
            </a>
          </td>
        `;
        logsTable.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error fetching logs:', error);
    showAlert('Error fetching logs. Please try again.', 'danger');
  }
}