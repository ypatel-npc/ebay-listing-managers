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
  // Create XML request body based on the working single listing XML structure
  const requestXml = `<?xml version="1.0" encoding="utf-8"?>
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
        <CategoryID>${item.category_id}</CategoryID>
      </PrimaryCategory>
      <StartPrice>${item.price}</StartPrice>
      <CategoryMappingAllowed>true</CategoryMappingAllowed>
      <ConditionID>${item.condition_id || '1000'}</ConditionID>
      <Country>US</Country>
      <Currency>USD</Currency>
      <DispatchTimeMax>3</DispatchTimeMax>
      <ListingDuration>GTC</ListingDuration>
      <ListingType>FixedPriceItem</ListingType>
      <PictureDetails>
        <PictureURL>${item.image_url || 'https://i.imgur.com/rvQ3LpG.jpg'}</PictureURL>
      </PictureDetails>
      <Quantity>${item.quantity}</Quantity>
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
          <ShippingServiceCost>${item.shipping_cost || '0.00'}</ShippingServiceCost>
          <ShippingServiceAdditionalCost>${item.shipping_cost || '0.00'}</ShippingServiceAdditionalCost>
        </ShippingServiceOptions>
      </ShippingDetails>
      <Site>US</Site>
      <Location>${item.location || 'United States'}</Location>
      <ItemSpecifics>
        <NameValueList>
          <Name>Brand</Name>
          <Value>${item.brand || getBrandFromTitle(item.title)}</Value>
        </NameValueList>
        ${item.processor ? `
        <NameValueList>
          <Name>Processor</Name>
          <Value>${item.processor}</Value>
        </NameValueList>` : ''}
        ${item.screen_size ? `
        <NameValueList>
          <Name>Screen Size</Name>
          <Value>${item.screen_size}</Value>
        </NameValueList>` : ''}
        ${item.model ? `
        <NameValueList>
          <Name>Model</Name>
          <Value>${item.model}</Value>
        </NameValueList>` : ''}
        ${item.storage_capacity ? `
        <NameValueList>
          <Name>Storage Capacity</Name>
          <Value>${item.storage_capacity}</Value>
        </NameValueList>` : getStorageFromTitle(item.title) ? `
        <NameValueList>
          <Name>Storage Capacity</Name>
          <Value>${getStorageFromTitle(item.title)}</Value>
        </NameValueList>` : ''}
        ${item.color ? `
        <NameValueList>
          <Name>Color</Name>
          <Value>${item.color}</Value>
        </NameValueList>` : getColorFromTitle(item.title) ? `
        <NameValueList>
          <Name>Color</Name>
          <Value>${getColorFromTitle(item.title)}</Value>
        </NameValueList>` : ''}
        ${item.connectivity ? `
        <NameValueList>
          <Name>Connectivity</Name>
          <Value>${item.connectivity}</Value>
        </NameValueList>` : `
        <NameValueList>
          <Name>Connectivity</Name>
          <Value>${getConnectivityByCategory(item.category_id)}</Value>
        </NameValueList>`}
        ${item.type ? `
        <NameValueList>
          <Name>Type</Name>
          <Value>${item.type}</Value>
        </NameValueList>` : `
        <NameValueList>
          <Name>Type</Name>
          <Value>${getTypeByCategory(item.category_id, item.title)}</Value>
        </NameValueList>`}
      </ItemSpecifics>
      <SKU>${item.sku || ''}</SKU>
      <SellerProfiles>
        <SellerPaymentProfile>
          <PaymentProfileID>241761903026</PaymentProfileID>
        </SellerPaymentProfile>
        <SellerReturnProfile>
          <ReturnProfileID>241759779026</ReturnProfileID>
        </SellerReturnProfile>
        <SellerShippingProfile>
          <ShippingProfileID>241759783026</ShippingProfileID>
        </SellerShippingProfile>
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
    
    throw new Error(errorMsg);
  }
  
  return result.AddItemResponse.ItemID;
}

// Helper function to extract brand from title
function getBrandFromTitle(title) {
  const commonBrands = ['Apple', 'Samsung', 'Sony', 'Dell', 'HP', 'Lenovo', 'LG', 'Microsoft', 'Asus', 'Acer'];
  for (const brand of commonBrands) {
    if (title.includes(brand)) {
      return brand;
    }
  }
  return 'Unbranded';
}

// Helper function to extract storage capacity from title
function getStorageFromTitle(title) {
  const storageRegex = /(\d+)\s*(GB|TB)/i;
  const match = title.match(storageRegex);
  if (match) {
    return `${match[1]} ${match[2].toUpperCase()}`;
  }
  return null;
}

// Helper function to extract color from title
function getColorFromTitle(title) {
  const commonColors = ['Black', 'White', 'Silver', 'Gold', 'Gray', 'Graphite', 'Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Pink'];
  for (const color of commonColors) {
    if (title.includes(color)) {
      return color;
    }
  }
  return 'Not Specified';
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