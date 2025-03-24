const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const router = express.Router();
const { isAuthenticated } = require('./auth');
const config = require('../config');

// Get all active listings
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': '0',
      },
      data: `<?xml version="1.0" encoding="utf-8"?>
      <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${req.session.authToken}</eBayAuthToken>
        </RequesterCredentials>
        <ActiveList>
          <Include>true</Include>
          <Pagination>
            <EntriesPerPage>100</EntriesPerPage>
            <PageNumber>1</PageNumber>
          </Pagination>
        </ActiveList>
      </GetMyeBaySellingRequest>`
    });
    
    // Parse XML response
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    if (result.GetMyeBaySellingResponse.Ack === 'Success' || result.GetMyeBaySellingResponse.Ack === 'Warning') {
      let listings = [];
      
      if (result.GetMyeBaySellingResponse.ActiveList && 
          result.GetMyeBaySellingResponse.ActiveList.ItemArray && 
          result.GetMyeBaySellingResponse.ActiveList.ItemArray.Item) {
        
        // Convert to array if it's a single item
        const items = Array.isArray(result.GetMyeBaySellingResponse.ActiveList.ItemArray.Item) 
          ? result.GetMyeBaySellingResponse.ActiveList.ItemArray.Item 
          : [result.GetMyeBaySellingResponse.ActiveList.ItemArray.Item];
        
        listings = items.map(item => ({
          itemId: item.ItemID,
          title: item.Title,
          price: item.SellingStatus?.CurrentPrice?._,
          quantity: item.Quantity,
          quantityAvailable: item.QuantityAvailable,
          listingStatus: item.SellingStatus?.ListingStatus,
          watchCount: item.WatchCount,
          imageUrl: item.PictureDetails?.GalleryURL,
          viewItemURL: item.ListingDetails?.ViewItemURL
        }));
      }
      
      return res.json({ success: true, listings });
    } else {
      return res.status(400).json({ error: 'Failed to get listings' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error getting listings', details: error.message });
  }
});

// Create a new listing
router.post('/', isAuthenticated, async (req, res) => {
  console.log('Received create listing request');
  
  try {
    const {
      title,
      description,
      categoryId,
      price,
      conditionId,
      quantity,
      imageUrl,
      itemSpecifics,
      outOfStockControl
    } = req.body;
    
    console.log('Extracted fields for validation:');
    console.log('title:', title);
    console.log('description:', description);
    console.log('categoryId:', categoryId);
    console.log('price:', price);
    console.log('conditionId:', conditionId);
    console.log('imageUrl:', imageUrl);
    
    // Validate required fields
    if (!title || !description || !categoryId || !price || !conditionId || !imageUrl) {
      console.log('Validation failed - missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create XML request body
    let nameValueList = '';
    if (itemSpecifics) {
      for (const [name, value] of Object.entries(itemSpecifics)) {
        if (value) {
          nameValueList += `
            <NameValueList>
              <Name>${name.charAt(0).toUpperCase() + name.slice(1)}</Name>
              <Value>${value}</Value>
            </NameValueList>`;
        }
      }
    }
    
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${req.session.authToken}</eBayAuthToken>
      </RequesterCredentials>
      <ErrorLanguage>en_US</ErrorLanguage>
      <WarningLevel>High</WarningLevel>
      <Item>
        <Title>${title}</Title>
        <Description>${description}</Description>
        <PrimaryCategory>
          <CategoryID>${categoryId}</CategoryID>
        </PrimaryCategory>
        <StartPrice>${price}</StartPrice>
        <CategoryMappingAllowed>true</CategoryMappingAllowed>
        <ConditionID>${conditionId}</ConditionID>
        <Country>US</Country>
        <Currency>USD</Currency>
        <DispatchTimeMax>3</DispatchTimeMax>
        <ListingDuration>GTC</ListingDuration>
        <ListingType>FixedPriceItem</ListingType>
        <PictureDetails>
          <PictureURL>${imageUrl}</PictureURL>
        </PictureDetails>
        <PostalCode>95125</PostalCode>
        <Quantity>${quantity || '1'}</Quantity>
        
        <ItemSpecifics>
          ${nameValueList}
        </ItemSpecifics>
        
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
        
        <Site>US</Site>
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
      const itemId = result.AddItemResponse.ItemID;
      const listingUrl = `https://www.ebay.com/itm/${itemId}`;
      
      let warnings = [];
      if (result.AddItemResponse.Ack === 'Warning' && result.AddItemResponse.Errors) {
        warnings = Array.isArray(result.AddItemResponse.Errors) 
          ? result.AddItemResponse.Errors 
          : [result.AddItemResponse.Errors];
      }
      
      return res.json({ 
        success: true, 
        itemId, 
        listingUrl,
        warnings: warnings.map(w => ({ 
          message: w.ShortMessage, 
          details: w.LongMessage 
        }))
      });
    } else {
      const errors = Array.isArray(result.AddItemResponse.Errors) 
        ? result.AddItemResponse.Errors 
        : [result.AddItemResponse.Errors];
      
      return res.status(400).json({ 
        error: 'Failed to create listing',
        details: errors.map(e => ({ 
          message: e.ShortMessage, 
          details: e.LongMessage 
        }))
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error creating listing', details: error.message });
  }
});

// Update listing quantity
router.put('/:itemId/quantity', isAuthenticated, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    
    if (!quantity) {
      return res.status(400).json({ error: 'Quantity is required' });
    }
    
    // Create XML request body
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${req.session.authToken}</eBayAuthToken>
      </RequesterCredentials>
      <ErrorLanguage>en_US</ErrorLanguage>
      <WarningLevel>High</WarningLevel>
      <Item>
        <ItemID>${itemId}</ItemID>
        <Quantity>${quantity}</Quantity>
      </Item>
    </ReviseItemRequest>`;
    
    // Make API request
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'ReviseItem',
        'X-EBAY-API-SITEID': '0',
      },
      data: requestXml
    });
    
    // Parse XML response
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    if (result.ReviseItemResponse.Ack === 'Success' || result.ReviseItemResponse.Ack === 'Warning') {
      return res.json({ success: true, itemId });
    } else {
      return res.status(400).json({ error: 'Failed to update quantity' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error updating quantity', details: error.message });
  }
});

module.exports = router; 