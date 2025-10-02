# PixelScribe Bot

Headless bot service for joining Google Meet links and recording audio.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your bot credentials
   ```

3. **Required environment variables:**
   - `BOT_EMAIL`: Google account email for joining meetings
   - `BOT_PASSWORD`: Google account password
   - `API_BASE_URL`: Your Vercel app URL (default: https://pixelscribe3.vercel.app)

## Deployment on Render

1. **Create a new Web Service on Render**
2. **Connect your Git repository**
3. **Set environment variables:**
   - `BOT_EMAIL`
   - `BOT_PASSWORD` 
   - `API_BASE_URL`
4. **Build command:** `npm install`
5. **Start command:** `npm start`

## How it works

1. **Receives meeting requests** via POST `/start-recording`
2. **Launches Chrome browser** with Playwright
3. **Joins Google Meet** using the provided link
4. **Records audio** using ffmpeg
5. **Sends audio to webhook** for processing
6. **Updates meeting status** in your app

## API Endpoints

- `POST /start-recording` - Start recording a meeting
- `GET /health` - Health check

## Testing

```bash
# Start the bot
npm start

# Test health
curl http://localhost:3000/health

# Start recording
curl -X POST http://localhost:3000/start-recording \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"test-123","meetLink":"https://meet.google.com/abc-def-ghi"}'
```
