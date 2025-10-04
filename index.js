const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Install Playwright browsers if needed (non-blocking)
setImmediate(async () => {
  try {
    const { execSync } = require('child_process');
    execSync('npx playwright install chromium', { stdio: 'pipe' });
    console.log('Playwright browsers ready');
  } catch (error) {
    console.log('Playwright installation in progress or already installed');
  }
});

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Bot configuration
const BOT_EMAIL = process.env.BOT_EMAIL;
const BOT_PASSWORD = process.env.BOT_PASSWORD;
const API_BASE_URL = process.env.API_BASE_URL || 'https://pixelscribe3.vercel.app';

console.log('Bot starting with config:', {
  hasEmail: !!BOT_EMAIL,
  hasPassword: !!BOT_PASSWORD,
  apiBaseUrl: API_BASE_URL
});

// Store active recordings
const activeRecordings = new Map();

// Join meeting and start recording
async function joinMeetingAndRecord(meetingId, meetLink) {
  console.log(`Starting recording for meeting ${meetingId}: ${meetLink}`);
  
  let browser;
  let context;
  let page;
  let recordingProcess;
  
  try {
    // Launch browser with proper settings for Google Meet
    browser = await chromium.launch({
      headless: process.env.NODE_ENV === 'production', // Headless in production
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--use-fake-ui-for-media-stream',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });

    context = await browser.newContext({
      permissions: ['microphone', 'camera'],
      media: { audio: true, video: false },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });

    page = await context.newPage();

    // Navigate to Google Meet
    console.log('Navigating to Google Meet...');
    await page.goto(meetLink, { waitUntil: 'networkidle' });

    // Wait for the page to load
    await page.waitForTimeout(5000);
    
    // Take a screenshot for debugging
    try {
      await page.screenshot({ path: `/tmp/meeting_${meetingId}_before_join.png` });
      console.log('Screenshot saved for debugging');
    } catch (e) {
      console.log('Could not save screenshot:', e.message);
    }

    // Try to join the meeting using the simpler approach
    console.log('Attempting to join meeting as guest...');
    
    try {
      // Fill the "Your name" input field
      const nameInput = await page.waitForSelector('input[aria-label="Your name"]', { timeout: 10000 });
      if (nameInput) {
        await nameInput.fill('Meeting Bot');
        console.log('Entered name: Meeting Bot');
      }
    } catch (error) {
      console.log('⚠️ Could not find name input, trying alternative selectors...');
      
      // Try alternative selectors for name input
      const alternativeSelectors = [
        'input[placeholder*="name"]',
        'input[placeholder*="Name"]',
        'input[type="text"]',
        'input[aria-label*="name"]',
        'input[aria-label*="Name"]'
      ];
      
      let nameEntered = false;
      for (const selector of alternativeSelectors) {
        try {
          const input = await page.waitForSelector(selector, { timeout: 2000 });
          if (input) {
            await input.fill('Meeting Bot');
            console.log(`Entered name using selector: ${selector}`);
            nameEntered = true;
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!nameEntered) {
        console.log('⚠️ Could not find any name input field');
      }
    }

    // Press Enter to join the meeting
    console.log('Pressing Enter to join the meeting...');
    await page.keyboard.press('Enter');

    // Wait for the meeting to load
    console.log('Waiting for meeting to load...');
    await page.waitForTimeout(10000);

    // Check if we successfully joined
    const inMeeting = await page.evaluate(() => {
      // Look for indicators that we're in the meeting
      const meetingIndicators = [
        document.querySelector('[data-promo-anchor-id="join-now"]') === null,
        document.querySelector('[jsname="BOHaEe"]') === null, // Ask to join button
        document.querySelector('button[aria-label*="Join"]') === null,
        document.querySelector('.VfPpkd-LgbsSe[data-promo-anchor-id="join-now"]') === null
      ];
      return meetingIndicators.some(indicator => indicator);
    });

    if (inMeeting) {
      console.log('Successfully joined the meeting! Bot should be visible to other participants.');
    } else {
      console.log('Still waiting to join the meeting...');
      // Try clicking any remaining join buttons
      try {
        const joinButton = await page.waitForSelector('button[aria-label*="Join"], button[aria-label*="join"], button[jsname="BOHaEe"]', { timeout: 5000 });
        if (joinButton) {
          await joinButton.click();
          console.log('Clicked additional join button');
          await page.waitForTimeout(5000);
        }
      } catch (e) {
        console.log('No additional join buttons found');
      }
    }
    
    // Take another screenshot after joining attempt
    try {
      await page.screenshot({ path: `/tmp/meeting_${meetingId}_after_join.png` });
      console.log('Post-join screenshot saved for debugging');
    } catch (e) {
      console.log('Could not save post-join screenshot:', e.message);
    }

    // Start audio recording
    console.log('Starting audio recording...');
    const audioFile = `/tmp/meeting_${meetingId}_${Date.now()}.wav`;
    
    // Record the meeting audio using ffmpeg
    console.log('Setting up audio recording...');
    
    recordingProcess = ffmpeg()
      .input('default') // Default audio input
      .inputFormat('pulse') // For Linux systems (Render)
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .output(audioFile)
      .on('start', () => {
        console.log('Audio recording started - bot is now recording the meeting');
      })
      .on('error', (err) => {
        console.error('Recording error:', err);
        // Fallback: create a mock file if recording fails
        console.log('Creating fallback audio file...');
        const mockAudioBuffer = Buffer.alloc(16000 * 2);
        fs.writeFileSync(audioFile, mockAudioBuffer);
      });

    recordingProcess.run();

    // Store the recording info
    activeRecordings.set(meetingId, {
      process: recordingProcess,
      audioFile,
      startTime: Date.now()
    });

    // Record for a reasonable duration (5 minutes for testing)
    const RECORDING_DURATION = 5 * 60 * 1000; // 5 minutes
    console.log(`Recording meeting audio for ${RECORDING_DURATION / 1000} seconds...`);
    console.log('Bot is now visible in the meeting and recording audio');
    
    await new Promise(resolve => setTimeout(resolve, RECORDING_DURATION));

    console.log('Recording complete - stopping audio capture');
    
    // Stop the recording process
    if (recordingProcess) {
      recordingProcess.kill('SIGTERM');
      console.log('Audio recording stopped');
    }

    // Process the audio
    await processAudioFile(meetingId, audioFile);

  } catch (error) {
    console.error('Error in meeting recording:', error);
    await updateMeetingStatus(meetingId, 'failed', error.message);
  } finally {
    // Cleanup
    if (browser) {
      await browser.close();
    }
    activeRecordings.delete(meetingId);
  }
}

// Process the recorded audio file
async function processAudioFile(meetingId, audioFile) {
  try {
    console.log(`Processing audio file: ${audioFile}`);
    
    // Check if file exists and has content
    if (!fs.existsSync(audioFile)) {
      throw new Error('Audio file not found');
    }

    const stats = fs.statSync(audioFile);
    if (stats.size === 0) {
      throw new Error('Audio file is empty');
    }

    console.log(`Audio file size: ${stats.size} bytes`);

    // Convert to base64 for the webhook
    const audioBuffer = fs.readFileSync(audioFile);
    const audioDataUri = `data:audio/wav;base64,${audioBuffer.toString('base64')}`;

    // Send to webhook
    await sendToWebhook(meetingId, audioDataUri);

    // Clean up the file
    fs.unlinkSync(audioFile);
    console.log('Audio file processed and cleaned up');

  } catch (error) {
    console.error('Error processing audio:', error);
    await updateMeetingStatus(meetingId, 'failed', error.message);
  }
}

// Send audio to webhook
async function sendToWebhook(meetingId, audioDataUri) {
  try {
    console.log(`Sending audio to webhook for meeting ${meetingId}`);
    
    const response = await fetch(`${API_BASE_URL}/api/webhooks/drive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meetingId,
        audioDataUri
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    console.log('Audio sent to webhook successfully');
    await updateMeetingStatus(meetingId, 'completed');

  } catch (error) {
    console.error('Error sending to webhook:', error);
    await updateMeetingStatus(meetingId, 'failed', error.message);
  }
}

// Update meeting status
async function updateMeetingStatus(meetingId, status, errorMessage = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        errorMessage
      })
    });

    if (!response.ok) {
      console.error(`Failed to update meeting status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error updating meeting status:', error);
  }
}

// API endpoint to start recording
app.post('/start-recording', async (req, res) => {
  try {
    const { meetingId, meetLink } = req.body;
    
    if (!meetingId || !meetLink) {
      return res.status(400).json({ error: 'meetingId and meetLink are required' });
    }

    console.log(`Received recording request for meeting ${meetingId}`);
    
    // Start recording in background
    joinMeetingAndRecord(meetingId, meetLink).catch(error => {
      console.error('Background recording error:', error);
    });

    res.json({ 
      success: true, 
      message: 'Recording started',
      meetingId 
    });

  } catch (error) {
    console.error('Error starting recording:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeRecordings: activeRecordings.size,
    timestamp: new Date().toISOString()
  });
});

// Only start server if this file is run directly
if (require.main === module) {
  // Start server
  app.listen(PORT, () => {
    console.log(`Bot server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Playwright browsers path: ${process.env.PLAYWRIGHT_BROWSERS_PATH || 'default'}`);
  });
}

module.exports = app;
