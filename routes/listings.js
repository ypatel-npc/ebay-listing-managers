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
  try {
    const { title, description, price, quantity, categoryId, conditionId, imageUrl, itemSpecifics, location } = req.body;
    
    // Validate required fields
    if (!title || !description || !price || !quantity || !categoryId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    console.log('Creating listing with category ID:', categoryId);
    
    // Generate item specifics XML
    let itemSpecificsXml = '';
    if (itemSpecifics && itemSpecifics.length > 0) {
      itemSpecificsXml = `
      <ItemSpecifics>
        ${itemSpecifics.map(spec => `
        <NameValueList>
          <Name>${spec.name}</Name>
          <Value>${spec.value}</Value>
        </NameValueList>`).join('')}
      </ItemSpecifics>`;
    }
    
    // Use the provided category ID directly without verification
    const finalCategoryId = categoryId;
    
    // Always include condition for automotive parts
    let conditionXml = '';
    if (conditionId) {
      conditionXml = `<ConditionID>${conditionId}</ConditionID>`;
    } else {
      // Default to New (1000) if no condition is provided
      conditionXml = `<ConditionID>1000</ConditionID>`;
    }
    
    // Get eBay API credentials and business policies from config
    const config = require('../config');
    
    // Create XML request body with business policies
    let requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${req.session.authToken}</eBayAuthToken>
      </RequesterCredentials>
      <ErrorLanguage>en_US</ErrorLanguage>
      <WarningLevel>High</WarningLevel>
      <Item>
        <Title>${title}</Title>
        <Description><![CDATA[${description}]]></Description>
        <PrimaryCategory>
          <CategoryID>${finalCategoryId}</CategoryID>
        </PrimaryCategory>
        <StartPrice>${price}</StartPrice>
        <CategoryMappingAllowed>true</CategoryMappingAllowed>
        ${conditionXml}
        <Country>US</Country>
        <Currency>USD</Currency>
        <DispatchTimeMax>3</DispatchTimeMax>
        <ListingDuration>GTC</ListingDuration>
        <ListingType>FixedPriceItem</ListingType>
        <Location>${location || 'United States'}</Location>
        ${imageUrl ? `
        <PictureDetails>
          <PictureURL>${imageUrl}</PictureURL>
        </PictureDetails>
        ` : ''}
        ${itemSpecificsXml}
        <Quantity>${quantity}</Quantity>
        
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
    
    try {
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
      
      if (result.AddItemResponse.Ack === 'Success' || result.AddItemResponse.Ack === 'Warning') {
        return res.json({
          success: true,
          itemId: result.AddItemResponse.ItemID,
          fees: result.AddItemResponse.Fees
        });
      } else {
        const errors = result.AddItemResponse.Errors;
        const errorMsg = Array.isArray(errors) 
          ? errors.map(e => e.LongMessage).join(', ') 
          : errors?.LongMessage || 'Failed to create listing';
        
        return res.status(400).json({ error: errorMsg });
      }
    } catch (apiError) {
      console.error('API error creating listing:', apiError.message);
      return res.status(500).json({ 
        error: 'Error creating listing', 
        details: apiError.response?.data || apiError.message 
      });
    }
  } catch (error) {
    console.error('Error creating listing:', error);
    return res.status(500).json({ error: 'Error creating listing', details: error.message });
  }
});

// Helper function to get leaf category
async function getLeafCategory(categoryId, authToken) {
  try {
    // If the category ID is 9355, return it immediately as we know it's a leaf category
    if (categoryId === '9355') {
      return categoryId;
    }
    
    const config = require('../config');
    
    // Create XML request body
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <GetCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${authToken}</eBayAuthToken>
      </RequesterCredentials>
      <CategoryParent>${categoryId}</CategoryParent>
      <DetailLevel>ReturnAll</DetailLevel>
      <LevelLimit>1</LevelLimit>
    </GetCategoriesRequest>`;
    
    // Make API request
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'GetCategories',
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
    
    if (result.GetCategoriesResponse.Ack === 'Success' || result.GetCategoriesResponse.Ack === 'Warning') {
      // Check if we have child categories
      if (result.GetCategoriesResponse.CategoryArray && result.GetCategoriesResponse.CategoryArray.Category) {
        const categories = Array.isArray(result.GetCategoriesResponse.CategoryArray.Category) 
          ? result.GetCategoriesResponse.CategoryArray.Category 
          : [result.GetCategoriesResponse.CategoryArray.Category];
        
        // If we have child categories, return the first one
        if (categories.length > 0) {
          return categories[0].CategoryID;
        }
      }
    }
    
    // If no child categories or error, return the original category ID
    return categoryId;
  } catch (error) {
    console.error('Error in getLeafCategory:', error.message);
    return categoryId; // Return the original category ID if there's an error
  }
}

// Helper function to check if condition is applicable for a category
async function checkConditionApplicable(categoryId, authToken) {
  try {
    const config = require('../config');
    
    // For category 9355, condition is applicable
    if (categoryId === '9355') {
      return true;
    }
    
    // Create XML request body
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <GetCategoryFeaturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${authToken}</eBayAuthToken>
      </RequesterCredentials>
      <CategoryID>${categoryId}</CategoryID>
      <FeatureID>ConditionEnabled</FeatureID>
    </GetCategoryFeaturesRequest>`;
    
    // Make API request
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'GetCategoryFeatures',
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
    
    if (result.GetCategoryFeaturesResponse.Ack === 'Success' || result.GetCategoryFeaturesResponse.Ack === 'Warning') {
      const category = result.GetCategoryFeaturesResponse.Category;
      if (category && category.ConditionEnabled === 'true') {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error in checkConditionApplicable:', error.message);
    return true; // Default to true if there's an error
  }
}

// Helper function to get business policies
async function getBusinessPolicies(authToken) {
  try {
    const config = require('../config');
    
    // Create XML request body
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <GetSellerProfilesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${authToken}</eBayAuthToken>
      </RequesterCredentials>
    </GetSellerProfilesRequest>`;
    
    // Make API request
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'GetSellerProfiles',
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
    
    if (result.GetSellerProfilesResponse.Ack === 'Success' || result.GetSellerProfilesResponse.Ack === 'Warning') {
      const policies = {
        shipping: '',
        return: '',
        payment: ''
      };
      
      // Get shipping policy
      if (result.GetSellerProfilesResponse.SellerShippingProfileArray && 
          result.GetSellerProfilesResponse.SellerShippingProfileArray.SellerShippingProfile) {
        const shippingProfiles = result.GetSellerProfilesResponse.SellerShippingProfileArray.SellerShippingProfile;
        if (Array.isArray(shippingProfiles) && shippingProfiles.length > 0) {
          policies.shipping = shippingProfiles[0].ShippingProfileID;
        } else if (shippingProfiles.ShippingProfileID) {
          policies.shipping = shippingProfiles.ShippingProfileID;
        }
      }
      
      // Get return policy
      if (result.GetSellerProfilesResponse.SellerReturnProfileArray && 
          result.GetSellerProfilesResponse.SellerReturnProfileArray.SellerReturnProfile) {
        const returnProfiles = result.GetSellerProfilesResponse.SellerReturnProfileArray.SellerReturnProfile;
        if (Array.isArray(returnProfiles) && returnProfiles.length > 0) {
          policies.return = returnProfiles[0].ReturnProfileID;
        } else if (returnProfiles.ReturnProfileID) {
          policies.return = returnProfiles.ReturnProfileID;
        }
      }
      
      // Get payment policy
      if (result.GetSellerProfilesResponse.SellerPaymentProfileArray && 
          result.GetSellerProfilesResponse.SellerPaymentProfileArray.SellerPaymentProfile) {
        const paymentProfiles = result.GetSellerProfilesResponse.SellerPaymentProfileArray.SellerPaymentProfile;
        if (Array.isArray(paymentProfiles) && paymentProfiles.length > 0) {
          policies.payment = paymentProfiles[0].PaymentProfileID;
        } else if (paymentProfiles.PaymentProfileID) {
          policies.payment = paymentProfiles.PaymentProfileID;
        }
      }
      
      return policies;
    }
    
    return { shipping: '', return: '', payment: '' };
  } catch (error) {
    console.error('Error in getBusinessPolicies:', error.message);
    return { shipping: '', return: '', payment: '' };
  }
}

// Update listing quantity
router.put('/:itemId/quantity', isAuthenticated, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    
    if (quantity === undefined) {
      return res.status(400).json({ error: 'Quantity is required' });
    }
    
    // Convert quantity to integer
    const quantityValue = parseInt(quantity, 10);
    
    // Get eBay API credentials and business policies from config
    const config = require('../config');
    
    // Create XML request body with business policies
    let requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${req.session.authToken}</eBayAuthToken>
      </RequesterCredentials>
      <Item>
        <ItemID>${itemId}</ItemID>
        <Quantity>${quantityValue}</Quantity>
        
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
        'X-EBAY-API-APP-NAME': config.ebay.appId,
        'X-EBAY-API-DEV-NAME': config.ebay.devId,
        'X-EBAY-API-CERT-NAME': config.ebay.certId
      },
      data: requestXml
    });
    
    // Parse XML response
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    if (result.ReviseItemResponse.Ack === 'Success' || result.ReviseItemResponse.Ack === 'Warning') {
      return res.json({ 
        success: true, 
        itemId,
        message: 'Quantity updated successfully'
      });
    } else {
      const errors = result.ReviseItemResponse.Errors;
      const errorMsg = Array.isArray(errors) 
        ? errors.map(e => e.LongMessage).join(', ') 
        : errors?.LongMessage || 'Failed to update quantity';
      
      return res.status(400).json({ error: errorMsg });
    }
  } catch (error) {
    console.error('Error updating quantity:', error);
    return res.status(500).json({ 
      error: 'Error updating quantity', 
      details: error.response?.data || error.message 
    });
  }
});

// Helper function to verify if a category is valid
async function verifyCategory(categoryId, authToken) {
  try {
    const config = require('../config');
    
    // If the category ID is 9355, return true immediately as we know it's valid
    if (categoryId === '9355') {
      return true;
    }
    
    // Create XML request body
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <GetCategorySpecificsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${authToken}</eBayAuthToken>
      </RequesterCredentials>
      <CategoryID>${categoryId}</CategoryID>
    </GetCategorySpecificsRequest>`;
    
    // Make API request
    const response = await axios({
      method: 'post',
      url: 'https://api.ebay.com/ws/api.dll',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
        'X-EBAY-API-CALL-NAME': 'GetCategorySpecifics',
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
    
    if (result.GetCategorySpecificsResponse.Ack === 'Success' || result.GetCategorySpecificsResponse.Ack === 'Warning') {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error in verifyCategory:', error.message);
    return false;
  }
}

module.exports = router; 