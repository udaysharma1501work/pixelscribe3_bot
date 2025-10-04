const { execSync } = require('child_process');

console.log('Starting bot...');

try {
  // Install Playwright browsers
  console.log('Installing Playwright browsers...');
  execSync('npx playwright install chromium', { 
    stdio: 'inherit',
    timeout: 300000
  });
  console.log('Playwright installed successfully');
  
  // Start the main application
  console.log('Starting main application...');
  require('./index.js');
  
} catch (error) {
  console.error('Error during startup:', error);
  process.exit(1);
}
