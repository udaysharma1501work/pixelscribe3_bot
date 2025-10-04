const { execSync } = require('child_process');
const path = require('path');

console.log('Starting bot with Playwright installation check...');

try {
  // Check if Playwright browsers are installed
  console.log('Checking Playwright installation...');
  
  // Try to install Playwright browsers
  console.log('Installing Playwright browsers...');
  execSync('npx playwright install chromium', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  
  console.log('Playwright browsers installed successfully');
  
  // Start the main application
  console.log('Starting main application...');
  require('./index.js');
  
} catch (error) {
  console.error('Error during startup:', error);
  process.exit(1);
}
