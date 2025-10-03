# Deploy Bot to Render

## Quick Setup

1. **Go to [Render.com](https://render.com)**
2. **Create New Web Service**
3. **Connect GitHub Repository** (create a separate repo for the bot folder)
4. **Configure:**
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

## Environment Variables

Add these in Render dashboard:
- `BOT_EMAIL` = your-google-email@gmail.com
- `BOT_PASSWORD` = your-google-password
- `API_BASE_URL` = https://pixelscribe3.vercel.app
- `PORT` = 3000

## After Deployment

1. **Copy the Render URL** (e.g., https://pixelscribe-bot.onrender.com)
2. **Add to Vercel Environment Variables:**
   - `BOT_SERVICE_URL` = your-render-url
3. **Redeploy Vercel**

## Test

```bash
# Test bot health
curl https://your-bot-url.onrender.com/health

# Test recording
curl -X POST https://your-bot-url.onrender.com/start-recording \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"test-123","meetLink":"https://meet.google.com/abc-def-ghi"}'
```
