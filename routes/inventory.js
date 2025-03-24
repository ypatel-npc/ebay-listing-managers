const express = require('express');
const axios = require('axios');
const router = express.Router();
const { isAuthenticated } = require('./auth');

// Get eBay categories
router.get('/categories', isAuthenticated, async (req, res) => {
  try {
    const { query } = req.query;
    
    // Create XML request body
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
      },
      data: requestXml
    });
    
    // Parse XML response
    const xml2js = require('xml2js');
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
      
      return res.json({ success: true, categories });
    } else {
      return res.status(400).json({ error: 'Failed to get categories' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error getting categories', details: error.message });
  }
});

// Get item conditions
router.get('/conditions/:categoryId', isAuthenticated, async (req, res) => {
  try {
    const { categoryId } = req.params;
    
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

module.exports = router; 