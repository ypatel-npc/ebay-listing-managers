module.exports = {
  // eBay API credentials
  clientId: 'npc-npcsandb-PRD-fafedfc34-6d4ec723',
  clientSecret: 'PRD-afd696018bf9-50d6-4a5c-b627-5641',
  ruName: 'npc-npc-npcsandb-PR-kqfkq',
  
  // Business policy IDs
  shippingProfileId: '241759783026',
  returnProfileId: '241759779026',
  paymentProfileId: '241761903026',
  
  // Server settings
  port: 3000,
  sessionSecret: 'ebay-listing-manager-secret',
  ebay: {
	  appId: 'npc-npcsandb-PRD-fafedfc34-6d4ec723',
	  devId: 'a0fba50f-f562-486e-bf0b-ec378a5a81c1',
	  certId: 'PRD-afd696018bf9-50d6-4a5c-b627-5641',
    ruName: 'npc-npc-npcsandb-PR-kqfkq',
    businessPolicies: {
      shipping: '241759783026',
      return: '241759779026',
      payment: '241761903026'
    }
  }
}; 