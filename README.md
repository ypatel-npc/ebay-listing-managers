# eBay Listing Manager

A web application for managing eBay listings, including creating new listings, viewing existing listings, and updating quantities.

## Features

- Authentication with eBay Auth'n'Auth token
- View all active eBay listings
- Create new listings with support for:
  - Category search
  - Item specifics
  - Out-of-stock control
- Update listing quantities

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure your eBay API credentials in `config.js`

## Usage

1. Start the server:
   ```
   npm start
   ```
2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
3. Enter your eBay Auth'n'Auth token (which you can get from the `simple_auth.js` script)

## Getting an Auth'n'Auth Token

1. Run the `simple_auth.js` script from the ebay-listing-tool directory
2. Follow the prompts to authenticate with eBay
3. Copy the generated token and use it to log in to the eBay Listing Manager

## Configuration

Edit the `config.js` file to update:
- eBay API credentials
- Business policy IDs
- Server settings

## Out of Stock Listings

This application supports creating "out of stock" listings that remain visible on eBay even when the quantity is zero. This helps maintain your listing's search ranking and visibility.

To create an out-of-stock listing:
1. Check the "Enable out of stock control" checkbox when creating a listing
2. The quantity will automatically be set to 0
3. The listing will appear as "Out of stock" to buyers but remain visible in search results

## License

MIT 