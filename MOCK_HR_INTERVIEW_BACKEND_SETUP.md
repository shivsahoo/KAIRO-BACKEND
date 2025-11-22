# Mock HR Interview - Backend Setup Guide

This guide covers the backend setup for the Mock HR Interview feature (Task 4).

## Overview

The Mock HR Interview feature uses:
- **LiveKit** for video/audio rooms
- **OpenAI Whisper** for Speech-to-Text
- **OpenAI GPT-4** for AI candidate responses
- **OpenAI TTS** for Text-to-Speech

## Prerequisites

1. **Node.js** (v18 or higher)
2. **MongoDB** running locally or remotely
3. **OpenAI API Key** (required)
4. **LiveKit Server** (required for video rooms)

## Installation

### 1. Install Dependencies

The required dependencies have already been installed:

```bash
cd /home/chakit/Hackathon/KAIRO/KAIRO-BACKEND
npm install
```

**New dependencies added:**
- `livekit-server-sdk` - LiveKit server SDK for token generation
- `form-data` - For multipart form data handling

**Existing dependencies used:**
- `openai` - OpenAI SDK (Whisper, GPT-4, TTS)
- `multer` - File upload middleware
- `express` - Web framework

### 2. Environment Configuration

Create a `.env` file in the backend root directory:

```bash
touch .env
```

Add the following environment variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/kairo

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_minimum_32_characters
JWT_REFRESH_SECRET=your_jwt_refresh_secret_minimum_32_characters

# AI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
AI_PROVIDER=openai

# LiveKit Configuration (REQUIRED for Mock HR Interview)
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=ws://localhost:7880
```

## LiveKit Server Setup

You have **two options** for LiveKit:

### Option 1: LiveKit Cloud (Easiest)

1. Sign up at [LiveKit Cloud](https://cloud.livekit.io)
2. Create a new project
3. Get your API Key and Secret from the dashboard
4. Use the provided WebSocket URL

**Set in `.env`:**
```env
LIVEKIT_API_KEY=API*************************
LIVEKIT_API_SECRET=*******************************
LIVEKIT_URL=wss://your-project.livekit.cloud
```

### Option 2: Self-Hosted LiveKit (Development)

Install and run LiveKit server locally:

```bash
# Download LiveKit server (macOS/Linux)
wget https://github.com/livekit/livekit/releases/download/v1.5.0/livekit_1.5.0_linux_amd64.tar.gz
tar -xzf livekit_1.5.0_linux_amd64.tar.gz

# Create config file
cat > livekit.yaml <<EOF
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
keys:
  devkey: secret
EOF

# Run LiveKit server
./livekit-server --config livekit.yaml
```

**Set in `.env`:**
```env
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880
```

The server should display:
```
INFO  using config file         path=livekit.yaml
INFO  starting LiveKit server   version=1.5.0 nodeID=...
```

## OpenAI API Setup

1. Sign up at [OpenAI](https://platform.openai.com)
2. Create an API key
3. Add credits to your account (minimum $5 recommended)
4. Add to `.env`:

```env
OPENAI_API_KEY=sk-your-actual-api-key-here
```

**Required Models:**
- ✅ **whisper-1** - Speech-to-Text ($0.006/minute)
- ✅ **gpt-4** - AI responses ($0.03/1K tokens)
- ✅ **tts-1** - Text-to-Speech ($15/1M characters)

## Backend Implementation Files

The following files have been created:

### 1. Controller: `src/controllers/mock-interview.controller.js`

Implements all interview APIs:
- `getLiveKitToken()` - Generate room access tokens
- `getPersonas()` - Get available AI personas
- `startInterview()` - Initialize interview session
- `getInterview()` - Get interview status/transcript
- `askQuestion()` - Text-based questions
- `processAudioChunk()` - Voice recording processing
- `getAudioResponse()` - Serve TTS audio files
- `endInterview()` - Generate evaluation report

### 2. Routes: `src/routes/mock-interview.routes.js`

API endpoints:
- `POST /api/token` - Get LiveKit token
- `GET /api/personas` - Get personas
- `POST /api/interview/start` - Start interview
- `GET /api/interview/:roomName` - Get interview
- `POST /api/interview/:roomName/ask` - Text question
- `POST /api/interview/:roomName/audio` - Audio upload
- `GET /api/interview/:roomName/audio/:audioId` - Get audio
- `POST /api/interview/:roomName/end` - End interview

### 3. Server: `server.js` (updated)

Added mock interview routes:
```javascript
import mockInterviewRoutes from './src/routes/mock-interview.routes.js';
app.use('/api', mockInterviewRoutes);
```

## Data Storage

The implementation uses **in-memory storage** (`Map`) for active interviews:
- ✅ Suitable for hackathon/demo
- ✅ Fast and simple
- ❌ Data lost on server restart
- ❌ Not scalable for production

**For production:** Use MongoDB, Redis, or PostgreSQL to persist interview data.

## AI Candidate Personas

Three built-in personas:

### 1. Junior Frontend Developer (default)
- **Name:** Alex Kumar
- **Experience:** 1 year
- **Characteristics:** Eager, nervous, enthusiastic
- **Key:** `junior-frontend-developer`

### 2. Mid-Level Backend Developer
- **Name:** Sarah Johnson
- **Experience:** 4 years
- **Characteristics:** Confident, technical, problem-solver
- **Key:** `mid-level-backend-developer`

### 3. Senior Full-Stack Engineer
- **Name:** Michael Chen
- **Experience:** 8 years
- **Characteristics:** Expert, leadership, strategic
- **Key:** `senior-full-stack-engineer`

## Running the Backend

### 1. Start MongoDB

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongod

# Docker
docker run -d -p 27017:27017 --name mongodb mongo
```

### 2. Start LiveKit Server

```bash
# If self-hosted
./livekit-server --config livekit.yaml

# Or use LiveKit Cloud (already running)
```

### 3. Start Backend Server

```bash
cd /home/chakit/Hackathon/KAIRO/KAIRO-BACKEND
npm run dev
```

Expected output:
```
🚀 Server running on port 3000
📡 WebSocket server initialized
🌍 Environment: development
MongoDB Connected: localhost
```

### 4. Test the Setup

```bash
# Health check
curl http://localhost:3000/api/health

# Get personas
curl http://localhost:3000/api/personas

# Test LiveKit token generation
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/json" \
  -d '{"roomName":"test-room","participantName":"Test User"}'
```

## API Testing with Postman

Import the collection: `KAIRO_API.postman_collection.json`

Or test manually:

### 1. Generate LiveKit Token
```
POST http://localhost:3000/api/token
Content-Type: application/json

{
  "roomName": "interview-123",
  "participantName": "HR-Interviewer"
}
```

### 2. Start Interview
```
POST http://localhost:3000/api/interview/start
Content-Type: application/json

{
  "roomName": "interview-123",
  "personaKey": "junior-frontend-developer"
}
```

### 3. Ask Question (Text)
```
POST http://localhost:3000/api/interview/interview-123/ask
Content-Type: application/json

{
  "question": "Tell me about yourself and your experience"
}
```

### 4. End Interview
```
POST http://localhost:3000/api/interview/interview-123/end
```

## Troubleshooting

### Error: "LiveKit not configured"

**Cause:** Missing `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` in `.env`

**Fix:**
```bash
# Add to .env
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
LIVEKIT_URL=ws://localhost:7880
```

### Error: "OpenAI API key not configured"

**Cause:** Missing `OPENAI_API_KEY` in `.env`

**Fix:**
```bash
# Add to .env
OPENAI_API_KEY=sk-your-actual-key
```

### Error: "Failed to connect to LiveKit"

**Causes:**
1. LiveKit server not running
2. Wrong `LIVEKIT_URL` in `.env`
3. Firewall blocking ports

**Fix:**
```bash
# Check if LiveKit is running
curl http://localhost:7880

# Check logs
./livekit-server --config livekit.yaml --dev
```

### Error: "MongoDB connection failed"

**Cause:** MongoDB not running

**Fix:**
```bash
# Start MongoDB
brew services start mongodb-community  # macOS
sudo systemctl start mongod            # Linux
```

### Audio Upload Fails

**Causes:**
1. `uploads/` directory doesn't exist
2. File size too large (>10MB)

**Fix:**
```bash
# Create uploads directory
mkdir -p uploads
chmod 755 uploads
```

### OpenAI Rate Limits

**Error:** `429 Too Many Requests`

**Fix:**
- Add credits to OpenAI account
- Check usage at https://platform.openai.com/usage
- Implement rate limiting in production

## Security Notes

⚠️ **Current Implementation:**
- No authentication on interview routes (for hackathon simplicity)
- CORS allows all origins
- Tokens stored in memory

🔒 **For Production:**
- Add JWT authentication middleware
- Restrict CORS to specific domains
- Store interview data in database
- Implement rate limiting
- Add input validation and sanitization
- Use secure WebSocket connections (wss://)

## Architecture

### Data Flow

```
Frontend (React)
    ↓
LiveKit (Video/Audio)
    ↓
Backend API
    ↓
┌────────────────┐
│ Audio Chunk    │
│ (WebM)         │
└────────────────┘
    ↓
OpenAI Whisper (STT)
    ↓
┌────────────────┐
│ Transcript     │
│ (Text)         │
└────────────────┘
    ↓
OpenAI GPT-4
    ↓
┌────────────────┐
│ AI Response    │
│ (Text)         │
└────────────────┘
    ↓
OpenAI TTS
    ↓
┌────────────────┐
│ Audio Response │
│ (MP3)          │
└────────────────┘
    ↓
Frontend (Play Audio)
```

### Storage Structure

```javascript
activeInterviews = Map({
  "interview-123": {
    roomName: "interview-123",
    personaKey: "junior-frontend-developer",
    persona: {...},
    transcript: [
      { speaker: "HR", text: "...", timestamp: "..." },
      { speaker: "Candidate", text: "...", timestamp: "..." }
    ],
    audioResponses: {
      "audio-xyz": Buffer<MP3>
    },
    startedAt: "2025-11-22T10:00:00Z",
    evaluation: {...}
  }
})
```

## Cost Estimates

**Per 15-minute interview:**
- Whisper STT: ~$0.09 (15 minutes)
- GPT-4: ~$0.30 (10K tokens)
- TTS: ~$0.15 (1K characters)
- **Total: ~$0.54 per interview**

**100 interviews/month: ~$54**

## Performance

- LiveKit: <100ms latency for video/audio
- Whisper: ~2-3 seconds per audio chunk
- GPT-4: ~1-2 seconds for response
- TTS: ~1 second for audio generation
- **Total response time: 4-6 seconds**

## Next Steps

1. ✅ Backend setup complete
2. ✅ Frontend integration complete
3. 🎯 Test the full flow
4. 📊 Monitor OpenAI usage
5. 🚀 Deploy to production (optional)

## Support

For issues:
1. Check server logs: `npm run dev`
2. Verify `.env` configuration
3. Test individual APIs with Postman
4. Check OpenAI usage dashboard
5. Review LiveKit server logs

## Resources

- [LiveKit Documentation](https://docs.livekit.io)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [LiveKit Cloud Dashboard](https://cloud.livekit.io)
- [OpenAI Usage Dashboard](https://platform.openai.com/usage)

