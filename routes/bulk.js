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
      
      // Check if this is the automotive format
      const format = req.body.format || '';
      
      // Define required fields based on format
      let requiredFields;
      if (format === 'automotive') {
        requiredFields = [
          'SKU', 'Localized For', 'title', 'description', 
          'Picture URL 1', 'Brand', 'Condition', 
          'Total Ship to Home Quantity', 'Category'
        ];
      } else {
        // Default required fields
        requiredFields = ['title', 'description', 'price', 'quantity', 'category_id'];
      }
      
      // Check required fields
      const firstRow = results[0];
      const missingFields = requiredFields.filter(field => !firstRow.hasOwnProperty(field));
      
      if (missingFields.length > 0) {
        return res.status(400).json({ error: 'CSV is missing required fields', missingFields });
      }
      
      // Add items to the queue
      results.forEach(item => {
        listingQueue.push({
          item,
          status: 'pending',
          format: format
        });
      });
      
      // Start processing if not already running
      if (!isProcessing) {
        processQueue(req.session.authToken);
      }
      
      return res.json({ 
        success: true, 
        message: `${results.length} items added to the queue for processing`,
        queueId: Date.now().toString()
      });
    });
});

// Route to check processing status
router.get('/status', isAuthenticated, (req, res) => {
  const totalItems = listingQueue.length;
  const pendingItems = listingQueue.filter(item => item.status === 'pending').length;
  const successItems = listingQueue.filter(item => item.status === 'success').length;
  const failedItems = listingQueue.filter(item => item.status === 'failed').length;
  
  // Get error details for failed items
  const errors = listingQueue
    .filter(item => item.status === 'failed')
    .map(item => ({
      title: item.item.title || 'Unknown Item',
      sku: item.item.SKU || item.item.sku || 'No SKU',
      error: item.error || 'Unknown error'
    }));
  
  return res.json({
    success: true,
    status: {
      total: totalItems,
      pending: pendingItems,
      success: successItems,
      failed: failedItems,
      isProcessing,
      progress: totalItems > 0 ? Math.round(((successItems + failedItems) / totalItems) * 100) : 0
    },
    errors
  });
});

// Function to process the queue
async function processQueue(authToken) {
  if (isProcessing || listingQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  
  try {
    // Process items one by one
    for (const queueItem of listingQueue) {
      if (queueItem.status === 'pending') {
        try {
          // Process the item
          await createListing(queueItem.item, authToken, queueItem.format);
          queueItem.status = 'success';
        } catch (error) {
          queueItem.status = 'failed';
          queueItem.error = error.message || 'Error creating listing';
          console.error('Error processing item:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error processing queue:', error);
  } finally {
    isProcessing = false;
  }
}

// Function to create a listing from CSV data
async function createListing(item, authToken, format) {
  // Map CSV fields to eBay API fields based on format
  let title, description, price, quantity, categoryId, condition, imageUrl, sku, brand, type;
  
  if (format === 'automotive') {
    // Map automotive format fields
    title = item.title || '';
    description = item.description || '';
    price = item['List Price'] || '0.00';
    quantity = item['Total Ship to Home Quantity'] || '0';
    categoryId = item.Category || '';
    condition = mapConditionToId(item.Condition || '');
    imageUrl = item['Picture URL 1'] || '';
    sku = item.SKU || '';
    brand = item.Brand || '';
    type = item.Type || item['Attribute Value 1'] || '';
  } else {
    // Map standard format fields
    title = item.title || '';
    description = item.description || '';
    price = item.price || '0.00';
    quantity = item.quantity || '0';
    categoryId = item.category_id || '';
    condition = item.condition_id || '1000';
    imageUrl = item.image_url || '';
    sku = item.sku || '';
    brand = item.brand || '';
    type = item.type || '';
  }
  
  // Validate required fields
  if (!title || !description || !categoryId) {
    throw new Error('Missing required fields: title, description, or category');
  }
  
  // Create XML request body
  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
  <AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
    <RequesterCredentials>
      <eBayAuthToken>${authToken}</eBayAuthToken>
    </RequesterCredentials>
    <ErrorLanguage>en_US</ErrorLanguage>
    <WarningLevel>High</WarningLevel>
    <Item>
      <Title>${escapeXml(title)}</Title>
      <Description>${escapeXml(description)}</Description>
      <PrimaryCategory>
        <CategoryID>${categoryId}</CategoryID>
      </PrimaryCategory>
      <StartPrice>${price}</StartPrice>
      <CategoryMappingAllowed>true</CategoryMappingAllowed>
      <ConditionID>${condition}</ConditionID>
      <Country>US</Country>
      <Currency>USD</Currency>
      <DispatchTimeMax>3</DispatchTimeMax>
      <ListingDuration>GTC</ListingDuration>
      <ListingType>FixedPriceItem</ListingType>
      <PictureDetails>
        <PictureURL>${imageUrl}</PictureURL>
      </PictureDetails>
      <Quantity>${quantity}</Quantity>
      <ReturnPolicy>
        <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
        <RefundOption>MoneyBack</RefundOption>
        <ReturnsWithinOption>Days_30</ReturnsWithinOption>
        <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
      </ReturnPolicy>
      <ShippingDetails>
        <ShippingType>Flat</ShippingType>
        <ShippingServiceOptions>
          <ShippingServicePriority>1</ShippingServicePriority>
          <ShippingService>USPSPriority</ShippingService>
          <ShippingServiceCost>${parseFloat(item.shipping_cost || '9.99')}</ShippingServiceCost>
        </ShippingServiceOptions>
      </ShippingDetails>
      <SKU>${escapeXml(sku)}</SKU>
      <ItemSpecifics>
        <NameValueList>
          <Name>Brand</Name>
          <Value>${escapeXml(brand)}</Value>
        </NameValueList>
        <NameValueList>
          <Name>Type</Name>
          <Value>${escapeXml(type)}</Value>
        </NameValueList>
      </ItemSpecifics>
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
    },
    data: requestXml
  });
  
  // Parse XML response
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(response.data);
  
  if (result.AddItemResponse.Ack === 'Success' || result.AddItemResponse.Ack === 'Warning') {
    return {
      success: true,
      itemId: result.AddItemResponse.ItemID,
      fees: result.AddItemResponse.Fees
    };
  } else {
    const errors = result.AddItemResponse.Errors;
    const errorMsg = Array.isArray(errors) 
      ? errors.map(e => e.LongMessage).join(', ') 
      : errors?.LongMessage || 'Failed to create listing';
    
    throw new Error(errorMsg);
  }
}

// Helper function to escape XML special characters
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper function to map condition text to eBay condition ID
function mapConditionToId(condition) {
  const conditionMap = {
    'New': '1000',
    'NEW': '1000',
    'REMANUFACTURED': '2000',
    'Remanufactured': '2000',
    'Used': '3000',
    'USED': '3000',
    'For parts or not working': '7000'
  };
  
  return conditionMap[condition] || '1000';
}

// Helper function to determine connectivity based on category
function getConnectivityByCategory(categoryId) {
  // Map common category IDs to appropriate connectivity values
  const categoryMap = {
    '9355': 'Wireless', // Cell Phones
    '177': 'Wi-Fi', // Computers
    '44942': 'Bluetooth', // Audio equipment
    '112529': 'Bluetooth' // Headphones
  };
  
  return categoryMap[categoryId] || 'Not Specified';
}

// Helper function to determine type based on category and title
function getTypeByCategory(categoryId, title) {
  // For cell phones
  if (categoryId === '9355') {
    if (title.includes('iPhone')) return 'Smartphone';
    if (title.includes('Galaxy')) return 'Smartphone';
    return 'Smartphone';
  }
  
  // For computers
  if (categoryId === '177') {
    if (title.includes('Laptop')) return 'Laptop';
    if (title.includes('Desktop')) return 'Desktop';
    return 'Laptop';
  }
  
  // For audio equipment
  if (categoryId === '44942') {
    if (title.includes('AirPods')) return 'Earbuds';
    if (title.includes('Headphones')) return 'Headphones';
    return 'Audio Player';
  }
  
  // For headphones
  if (categoryId === '112529') {
    if (title.includes('Wireless')) return 'Wireless';
    if (title.includes('Over-Ear')) return 'Over-Ear';
    if (title.includes('In-Ear')) return 'In-Ear';
    return 'Over-Ear';
  }
  
  return 'Not Specified';
}

module.exports = router; 