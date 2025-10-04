const { execSync } = require('child_process');
const path = require('path');

console.log('Starting bot with Playwright installation check...');

try {
  // Check if Playwright browsers are already installed
  console.log('Checking Playwright installation...');
  
  try {
    // Check if Playwright is already working
    execSync('npx playwright --version', { stdio: 'pipe' });
    console.log('Playwright is already installed and working');
  } catch (checkError) {
    console.log('Playwright not found, attempting installation...');
    
    try {
      // Try to install Playwright browsers
      console.log('Installing Playwright browsers...');
      execSync('npx playwright install chromium', { 
        stdio: 'inherit',
        cwd: __dirname,
        timeout: 300000 // 5 minutes timeout
      });
      console.log('Playwright browsers installed successfully');
    } catch (installError) {
      console.warn('Playwright installation failed, trying alternative approach...');
      console.warn('Install error:', installError.message);
      
      // Try alternative installation method
      try {
        execSync('npx playwright install chromium --force', { 
          stdio: 'inherit',
          cwd: __dirname,
          timeout: 300000
        });
        console.log('Playwright browsers installed with force flag');
      } catch (forceError) {
        console.error('Force installation also failed:', forceError.message);
        console.log('Continuing anyway - Playwright may work with system browsers');
      }
    }
  }
  
  // Start the main application
  console.log('Starting main application...');
  require('./index.js');
  
} catch (error) {
  console.error('Error during startup:', error);
  process.exit(1);
}
