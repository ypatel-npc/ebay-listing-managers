const express = require('express');
const axios = require('axios');
const router = express.Router();
const { isAuthenticated } = require('./auth');

// Get eBay categories with fallback
router.get('/categories', isAuthenticated, async (req, res) => {
  try {
    const { query } = req.query;
    console.log('Category search requested for:', query);
    
    try {
      // Get eBay API credentials from config
      const config = require('../config');
      
      // Try to get categories from eBay API
      const requestXml = `<?xml version="1.0" encoding="utf-8"?>
      <GetSuggestedCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${req.session.authToken}</eBayAuthToken>
        </RequesterCredentials>
        <Query>${query || ''}</Query>
      </GetSuggestedCategoriesRequest>`;
      
      // Make API request
      const response = await axios({
        method: 'post',
        url: 'https://api.ebay.com/ws/api.dll',
        headers: {
          'Content-Type': 'text/xml',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1113',
          'X-EBAY-API-CALL-NAME': 'GetSuggestedCategories',
          'X-EBAY-API-SITEID': '0',
          // Add the missing required headers
          'X-EBAY-API-APP-NAME': config.ebay.appId,
          'X-EBAY-API-DEV-NAME': config.ebay.devId,
          'X-EBAY-API-CERT-NAME': config.ebay.certId
        },
        data: requestXml,
        timeout: 5000 // 5 second timeout
      });
      
      // Parse XML response
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      
      if (result.GetSuggestedCategoriesResponse.Ack === 'Success' || result.GetSuggestedCategoriesResponse.Ack === 'Warning') {
        let categories = [];
        
        if (result.GetSuggestedCategoriesResponse.SuggestedCategoryArray && 
            result.GetSuggestedCategoriesResponse.SuggestedCategoryArray.SuggestedCategory) {
          
          // Convert to array if it's a single category
          const suggestedCategories = Array.isArray(result.GetSuggestedCategoriesResponse.SuggestedCategoryArray.SuggestedCategory) 
            ? result.GetSuggestedCategoriesResponse.SuggestedCategoryArray.SuggestedCategory 
            : [result.GetSuggestedCategoriesResponse.SuggestedCategoryArray.SuggestedCategory];
          
          categories = suggestedCategories.map(cat => ({
            categoryId: cat.Category.CategoryID,
            name: cat.Category.CategoryName,
            confidence: cat.SuggestedCategoryConfidence
          }));
        }
        
        return res.json({ success: true, categories, source: 'ebay' });
      }
    } catch (error) {
      console.log('eBay API error, using fallback categories:', error.message);
      // Continue to fallback if there's an error
    }
    
    // Fallback: Use predefined categories that match the search query
    const fallbackCategories = getFallbackCategories();
    
    // Filter categories based on search query
    let filteredCategories = fallbackCategories;
    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredCategories = fallbackCategories.filter(cat => 
        cat.name.toLowerCase().includes(lowerQuery)
      );
    }
    
    return res.json({ 
      success: true, 
      categories: filteredCategories, 
      source: 'fallback',
      message: 'Using fallback categories due to eBay API unavailability'
    });
    
  } catch (error) {
    console.error('Error in category search:', error);
    return res.status(500).json({ error: 'Error getting categories', details: error.message });
  }
});

// Get item conditions
router.get('/conditions/:categoryId', isAuthenticated, async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    // Get eBay API credentials from config
    const config = require('../config');
    
    // Create XML request body
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
    <GetCategoryFeaturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <RequesterCredentials>
        <eBayAuthToken>${req.session.authToken}</eBayAuthToken>
      </RequesterCredentials>
      <CategoryID>${categoryId}</CategoryID>
      <FeatureID>ConditionValues</FeatureID>
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
        // Add the missing required headers
        'X-EBAY-API-APP-NAME': config.ebay.appId,
        'X-EBAY-API-DEV-NAME': config.ebay.devId,
        'X-EBAY-API-CERT-NAME': config.ebay.certId
      },
      data: requestXml
    });
    
    // Parse XML response
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    
    if (result.GetCategoryFeaturesResponse.Ack === 'Success' || result.GetCategoryFeaturesResponse.Ack === 'Warning') {
      let conditions = [];
      
      if (result.GetCategoryFeaturesResponse.Category && 
          result.GetCategoryFeaturesResponse.Category.ConditionValues && 
          result.GetCategoryFeaturesResponse.Category.ConditionValues.Condition) {
        
        // Convert to array if it's a single condition
        const conditionValues = Array.isArray(result.GetCategoryFeaturesResponse.Category.ConditionValues.Condition) 
          ? result.GetCategoryFeaturesResponse.Category.ConditionValues.Condition 
          : [result.GetCategoryFeaturesResponse.Category.ConditionValues.Condition];
        
        conditions = conditionValues.map(condition => ({
          id: condition.ID,
          name: condition.DisplayName
        }));
      }
      
      return res.json({ success: true, conditions });
    } else {
      return res.status(400).json({ error: 'Failed to get conditions' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error getting conditions', details: error.message });
  }
});

// Function to get fallback categories
function getFallbackCategories() {
  return [
    // Electronics
    { categoryId: "9355", name: "Cell Phones & Smartphones" },
    { categoryId: "178893", name: "Cell Phone Accessories" },
    { categoryId: "171485", name: "Cell Phone Parts" },
    { categoryId: "139971", name: "Tablets & eReaders" },
    { categoryId: "171961", name: "Tablet & eReader Accessories" },
    { categoryId: "175672", name: "Tablet & eReader Parts" },
    { categoryId: "3676", name: "Laptops & Netbooks" },
    { categoryId: "175673", name: "Laptop & Desktop Accessories" },
    { categoryId: "171961", name: "Laptop Parts & Accessories" },
    { categoryId: "162", name: "Desktop Computers" },
    { categoryId: "1185", name: "TV, Video & Home Audio" },
    { categoryId: "293", name: "Consumer Electronics" },
    { categoryId: "15032", name: "Video Games & Consoles" },
    { categoryId: "625", name: "Cameras & Photo" },
    { categoryId: "11232", name: "Computer Components & Parts" },
    
    // Clothing
    { categoryId: "11450", name: "Clothing, Shoes & Accessories" },
    { categoryId: "15724", name: "Women's Clothing" },
    { categoryId: "1059", name: "Men's Clothing" },
    { categoryId: "171146", name: "Men's Shoes" },
    { categoryId: "3034", name: "Women's Shoes" },
    { categoryId: "4250", name: "Women's Handbags & Bags" },
    { categoryId: "175759", name: "Men's Accessories" },
    { categoryId: "45333", name: "Kids' Clothing, Shoes & Accessories" },
    
    // Home & Garden
    { categoryId: "11700", name: "Home & Garden" },
    { categoryId: "20444", name: "Furniture" },
    { categoryId: "20697", name: "Kitchen, Dining & Bar" },
    { categoryId: "20710", name: "Bedding" },
    { categoryId: "20580", name: "Home Décor" },
    { categoryId: "159907", name: "Tools & Workshop Equipment" },
    { categoryId: "159912", name: "Yard, Garden & Outdoor Living" },
    
    // Collectibles
    { categoryId: "1", name: "Collectibles" },
    { categoryId: "237", name: "Toys & Hobbies" },
    { categoryId: "550", name: "Art" },
    { categoryId: "267", name: "Books & Magazines" },
    { categoryId: "11116", name: "Coins & Paper Money" },
    { categoryId: "64482", name: "Sports Memorabilia, Fan Shop & Sports Cards" },
    
    // Jewelry & Watches
    { categoryId: "281", name: "Jewelry & Watches" },
    { categoryId: "10290", name: "Women's Jewelry" },
    { categoryId: "10324", name: "Men's Jewelry" },
    { categoryId: "31387", name: "Engagement & Wedding Jewelry" },
    { categoryId: "14324", name: "Watches, Parts & Accessories" },
    
    // Beauty & Health
    { categoryId: "26395", name: "Health & Beauty" },
    { categoryId: "11854", name: "Fragrances" },
    { categoryId: "31786", name: "Makeup" },
    { categoryId: "11863", name: "Skin Care" },
    { categoryId: "31762", name: "Hair Care & Styling" },
    { categoryId: "67588", name: "Health Care" },
    
    // Business & Industrial
    { categoryId: "12576", name: "Business & Industrial" },
    { categoryId: "92074", name: "Industrial Automation & Motion Controls" },
    { categoryId: "183959", name: "Retail & Services" },
    { categoryId: "11804", name: "Restaurant & Food Service" },
    { categoryId: "25298", name: "Office Supplies & Equipment" },
    
    // Automotive
    { categoryId: "6000", name: "eBay Motors" },
    { categoryId: "33743", name: "Automotive Parts & Accessories" },
    { categoryId: "10063", name: "Automotive Tools & Supplies" },
    { categoryId: "6028", name: "Motorcycle Parts" },
    { categoryId: "124481", name: "Performance & Racing Parts" },
    
    // Sporting Goods
    { categoryId: "888", name: "Sporting Goods" },
    { categoryId: "15273", name: "Fitness, Running & Yoga" },
    { categoryId: "1492", name: "Cycling" },
    { categoryId: "1513", name: "Hunting" },
    { categoryId: "1503", name: "Fishing" },
    { categoryId: "1265", name: "Golf" },
    
    // Musical Instruments
    { categoryId: "619", name: "Musical Instruments & Gear" },
    { categoryId: "180010", name: "Guitars & Basses" },
    { categoryId: "180014", name: "Pro Audio Equipment" },
    { categoryId: "3858", name: "Drums & Percussion" },
    { categoryId: "16218", name: "String Instruments" }
  ];
}

module.exports = router; 