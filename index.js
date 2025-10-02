const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
    // Launch browser
    browser = await chromium.launch({
      headless: false, // Need to see the browser for debugging
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    context = await browser.newContext({
      permissions: ['microphone', 'camera'],
      media: { audio: true, video: false }
    });

    page = await context.newPage();

    // Navigate to Google Meet
    console.log('Navigating to Google Meet...');
    await page.goto(meetLink, { waitUntil: 'networkidle' });

    // Wait for the page to load
    await page.waitForTimeout(3000);

    // Try to join the meeting (this will vary based on Meet's current UI)
    console.log('Attempting to join meeting...');
    
    // Look for common join buttons
    const joinSelectors = [
      'button[data-promo-anchor-id="join-now"]',
      'button[jsname="Qx7uuf"]',
      'button[aria-label*="Join"]',
      'button[aria-label*="join"]',
      '.VfPpkd-LgbsSe[data-promo-anchor-id="join-now"]',
      '[data-promo-anchor-id="join-now"]'
    ];

    let joined = false;
    for (const selector of joinSelectors) {
      try {
        const button = await page.waitForSelector(selector, { timeout: 5000 });
        if (button) {
          await button.click();
          console.log('Clicked join button');
          joined = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!joined) {
      console.log('Could not find join button, trying to proceed anyway...');
    }

    // Wait a bit for the meeting to load
    await page.waitForTimeout(5000);

    // Start audio recording
    console.log('Starting audio recording...');
    const audioFile = `/tmp/meeting_${meetingId}_${Date.now()}.wav`;
    
    // Use a simple approach - record system audio if available
    // In production, you'd want to use a proper audio capture method
    recordingProcess = ffmpeg()
      .input('default') // Default audio input
      .inputFormat('pulse') // For Linux systems
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .output(audioFile)
      .on('start', () => {
        console.log('Audio recording started');
      })
      .on('error', (err) => {
        console.error('Recording error:', err);
      });

    recordingProcess.run();

    // Store the recording info
    activeRecordings.set(meetingId, {
      process: recordingProcess,
      audioFile,
      startTime: Date.now()
    });

    // Simulate recording for a duration (in production, you'd detect when meeting ends)
    const RECORDING_DURATION = 5 * 60 * 1000; // 5 minutes for testing
    console.log(`Recording for ${RECORDING_DURATION / 1000} seconds...`);
    
    await new Promise(resolve => setTimeout(resolve, RECORDING_DURATION));

    // Stop recording
    console.log('Stopping recording...');
    if (recordingProcess) {
      recordingProcess.kill('SIGTERM');
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

// Start server
app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
