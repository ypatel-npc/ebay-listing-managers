const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('./auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');

// Set up multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Queue for processing listings
const listingQueue = [];
let isProcessing = false;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Function to log bulk upload errors
function logBulkUploadError(item, error) {
  const timestamp = new Date().toISOString();
  const logFileName = 'bulk_upload_errors.log';
  const logFilePath = path.join(logsDir, logFileName);
  
  let logEntry = `[${timestamp}] ERROR: ${error}\n`;
  logEntry += `Title: ${item.title}\n`;
  logEntry += `Category: ${item.category_id}\n`;
  logEntry += `Price: ${item.price}\n`;
  logEntry += `Image: ${item.image_url}\n`;
  logEntry += `-------------------------------------------\n\n`;
  
  // Append to log file
  fs.appendFileSync(logFilePath, logEntry);
  
  console.log(`Error logged to ${logFilePath}`);
}

// Route to upload CSV file
router.post('/upload', isAuthenticated, upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Check file extension
  const fileExt = path.extname(req.file.originalname).toLowerCase();
  if (fileExt !== '.csv') {
    // Remove the uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only CSV files are allowed' });
  }
  
  // Process the CSV file
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      // Remove the uploaded file
      fs.unlinkSync(req.file.path);
      
      // Validate the CSV structure
      if (results.length === 0) {
        return res.status(400).json({ error: 'CSV file is empty' });
      }
      
      // Check required fields
      const requiredFields = ['title', 'description', 'price', 'quantity', 'category_id'];
      const firstRow = results[0];
      const missingFields = requiredFields.filter(field => !firstRow.hasOwnProperty(field));
      
      if (missingFields.length > 0) {
        return res.status(400).json({ 
          error: 'CSV is missing required fields', 
          missingFields 
        });
      }
      
      // Add items to the queue
      results.forEach(item => {
        listingQueue.push({
          ...item,
          status: 'pending',
          userId: req.session.userData.userId,
          authToken: req.session.authToken
        });
      });
      
      // Start processing if not already running
      if (!isProcessing) {
        processQueue();
      }
      
      return res.json({ 
        success: true, 
        message: `${results.length} items added to the queue for processing`,
        queueSize: listingQueue.length
      });
    });
});

// Route to get queue status
router.get('/status', isAuthenticated, (req, res) => {
  const pendingCount = listingQueue.filter(item => item.status === 'pending').length;
  const successCount = listingQueue.filter(item => item.status === 'success').length;
  const failedCount = listingQueue.filter(item => item.status === 'failed').length;
  
  return res.json({
    isProcessing,
    pendingCount,
    successCount,
    failedCount,
    totalCount: listingQueue.length
  });
});

// Function to process the queue
async function processQueue() {
  if (listingQueue.length === 0 || isProcessing) {
    return;
  }
  
  isProcessing = true;
  
  // Process items one by one
  while (listingQueue.length > 0) {
    const item = listingQueue.find(item => item.status === 'pending');
    if (!item) {
      break;
    }
    
    try {
      await createListing(item);
      item.status = 'success';
    } catch (error) {
      console.error('Error creating listing:', error);
      item.status = 'failed';
      item.error = error.message;
    }
    
    // Add a small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  isProcessing = false;
}

// Function to create a listing
async function createListing(item) {
  try {
    // Process item specifics from CSV
    let itemSpecificsXml = '';
    
    // Check if we have item specifics in the CSV
    const itemSpecifics = [];
    
    // Look for columns that start with "specific_" in the CSV data
    Object.keys(item).forEach(key => {
      if (key.startsWith('specific_') && item[key]) {
        const name = key.replace('specific_', '').replace(/_/g, ' ');
        itemSpecifics.push({
          name: name,
          value: item[key]
        });
      }
    });
    
    // Add required item specifics based on category if not already present
    addRequiredItemSpecifics(itemSpecifics, item.category_id);
    
    // Generate XML for item specifics
    if (itemSpecifics.length > 0) {
      itemSpecificsXml = `
      <ItemSpecifics>
        ${itemSpecifics.map(spec => `
        <NameValueList>
          <Name>${spec.name}</Name>
          <Value>${spec.value}</Value>
        </NameValueList>`).join('')}
      </ItemSpecifics>`;
    }
    
    // Get eBay API credentials and business policies from config
    const config = require('../config');
    
    // Use the provided category ID directly
    const categoryId = item.category_id || '9355';
    
    // Always include condition for automotive parts
    const conditionXml = `<ConditionID>${item.condition_id || '1000'}</ConditionID>`;
    
    // Create XML request body with business policies
    let requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${item.authToken}</eBayAuthToken>
      </RequesterCredentials>
      <ErrorLanguage>en_US</ErrorLanguage>
      <WarningLevel>High</WarningLevel>
      <Item>
        <Title>${item.title}</Title>
        <Description><![CDATA[${item.description}]]></Description>
        <PrimaryCategory>
          <CategoryID>${categoryId}</CategoryID>
        </PrimaryCategory>
        <StartPrice>${item.price}</StartPrice>
        <CategoryMappingAllowed>true</CategoryMappingAllowed>
        ${conditionXml}
        <Country>US</Country>
        <Currency>USD</Currency>
        <DispatchTimeMax>3</DispatchTimeMax>
        <ListingDuration>GTC</ListingDuration>
        <ListingType>FixedPriceItem</ListingType>
        <Location>${item.location || 'United States'}</Location>
        ${item.image_url ? `
        <PictureDetails>
          <PictureURL>${item.image_url}</PictureURL>
        </PictureDetails>
        ` : ''}
        ${itemSpecificsXml}
        <Quantity>${item.quantity}</Quantity>
        
        <!-- Add business policies from config -->
        <SellerProfiles>
          <SellerShippingProfile>
            <ShippingProfileID>${config.shippingProfileId}</ShippingProfileID>
          </SellerShippingProfile>
          <SellerReturnProfile>
            <ReturnProfileID>${config.returnProfileId}</ReturnProfileID>
          </SellerReturnProfile>
          <SellerPaymentProfile>
            <PaymentProfileID>${config.paymentProfileId}</PaymentProfileID>
          </SellerPaymentProfile>
        </SellerProfiles>
      </Item>
    </AddItemRequest>`;
    
    // Make API request
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'AddItem',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-APP-NAME': config.ebay.appId,
        'X-EBAY-API-DEV-NAME': config.ebay.devId,
        'X-EBAY-API-CERT-NAME': config.ebay.certId
      },
      data: requestXml
    });
    
    // Parse XML response
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    if (result.AddItemResponse.Ack !== 'Success' && result.AddItemResponse.Ack !== 'Warning') {
      const errors = result.AddItemResponse.Errors;
      const errorMsg = Array.isArray(errors) 
        ? errors.map(e => e.LongMessage).join(', ') 
        : errors?.LongMessage || 'Failed to create listing';
      
      // Log the error
      logBulkUploadError(item, errorMsg);
      
      throw new Error(errorMsg);
    }
    
    return result.AddItemResponse.ItemID;
  } catch (error) {
    // Log any other errors
    logBulkUploadError(item, error.message);
    throw error;
  }
}

// Function to add required item specifics based on category
function addRequiredItemSpecifics(itemSpecifics, categoryId) {
  // For category 9355 (Auto Parts), add required item specifics if not already present
  if (categoryId === '9355') {
    // Check if Brand is present
    if (!itemSpecifics.some(spec => spec.name === 'Brand')) {
      itemSpecifics.push({
        name: 'Brand',
        value: 'NPC Automotive'
      });
    }
    
    // Check if Manufacturer Part Number is present
    if (!itemSpecifics.some(spec => spec.name === 'Manufacturer Part Number')) {
      itemSpecifics.push({
        name: 'Manufacturer Part Number',
        value: 'NPC-' + Math.floor(Math.random() * 1000000)
      });
    }
    
    // Check if Fitment Type is present
    if (!itemSpecifics.some(spec => spec.name === 'Fitment Type')) {
      itemSpecifics.push({
        name: 'Fitment Type',
        value: 'Direct Replacement'
      });
    }
  }
}

// Add a route to view the error log
router.get('/error-log', isAuthenticated, (req, res) => {
  try {
    const logFilePath = path.join(logsDir, 'bulk_upload_errors.log');
    
    if (!fs.existsSync(logFilePath)) {
      return res.json({ log: 'No errors logged yet.' });
    }
    
    const logContent = fs.readFileSync(logFilePath, 'utf8');
    return res.json({ log: logContent });
  } catch (error) {
    console.error('Error reading error log:', error);
    return res.status(500).json({ error: 'Error reading error log' });
  }
});

module.exports = router; 