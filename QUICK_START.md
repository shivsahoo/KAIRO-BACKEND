# Quick Start Guide - Mock HR Interview

Get the Mock HR Interview feature running in 5 minutes!

## Prerequisites Checklist

- [ ] Node.js v18+ installed
- [ ] MongoDB running
- [ ] OpenAI API key (get from https://platform.openai.com/api-keys)
- [ ] LiveKit account (option 1) OR LiveKit server installed (option 2)

## Step 1: Environment Setup (2 minutes)

Create `.env` file in backend root:

```bash
cd /home/chakit/Hackathon/KAIRO/KAIRO-BACKEND
touch .env
```

Add these **minimum required** variables:

```env
# Server
PORT=3000
FRONTEND_URL=http://localhost:5173

# Database
MONGODB_URI=mongodb://localhost:27017/kairo

# JWT (use any random 32+ character strings)
JWT_SECRET=kairo_super_secret_jwt_key_minimum_32_characters_long_abc123
JWT_REFRESH_SECRET=kairo_super_secret_refresh_key_minimum_32_characters_long_xyz789

# OpenAI (REQUIRED - get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
AI_PROVIDER=openai

# LiveKit - Choose ONE option below:

# OPTION 1: LiveKit Cloud (Easiest - recommended)
# Sign up at https://cloud.livekit.io and copy your keys
LIVEKIT_API_KEY=API*************************
LIVEKIT_API_SECRET=*******************************
LIVEKIT_URL=wss://your-project.livekit.cloud

# OPTION 2: Local LiveKit Server (Development)
# Use these if you're running LiveKit locally (see Step 2)
# LIVEKIT_API_KEY=devkey
# LIVEKIT_API_SECRET=secret
# LIVEKIT_URL=ws://localhost:7880
```

## Step 2: LiveKit Setup (1 minute)

### Option A: LiveKit Cloud (Easiest) ⭐ Recommended

1. Go to https://cloud.livekit.io
2. Click "Sign Up" (free tier available)
3. Create a new project
4. Copy `API Key`, `API Secret`, and `WebSocket URL`
5. Paste into `.env` file

**Done!** LiveKit is ready.

### Option B: Local LiveKit Server

```bash
# Download LiveKit (Linux/macOS)
cd ~
wget https://github.com/livekit/livekit/releases/download/v1.5.0/livekit_1.5.0_linux_amd64.tar.gz
tar -xzf livekit_1.5.0_linux_amd64.tar.gz

# Create config
cat > livekit.yaml <<EOF
port: 7880
keys:
  devkey: secret
EOF

# Run server (keep this terminal open)
./livekit-server --config livekit.yaml
```

Should see:
```
INFO  starting LiveKit server   version=1.5.0
```

## Step 3: Start Services (1 minute)

### Terminal 1: MongoDB
```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Docker
docker run -d -p 27017:27017 --name mongodb mongo
```

### Terminal 2: Backend
```bash
cd /home/chakit/Hackathon/KAIRO/KAIRO-BACKEND
npm install  # if not done already
npm run dev
```

Should see:
```
🚀 Server running on port 3000
📡 WebSocket server initialized
MongoDB Connected: localhost
```

### Terminal 3: Frontend
```bash
cd /home/chakit/Hackathon/KAIRO/KAIRO-FRONTEND
npm install  # if not done already
npm run dev
```

Should see:
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

## Step 4: Test It! (1 minute)

1. **Open browser:** http://localhost:5173
2. **Sign up/Login** with any credentials
3. **Select role:** Choose "HR Executive"
4. **Look for Task 4** in the right sidebar (Tasks panel)
5. **Click "Start Mock Interview"** button
6. **Select persona** (e.g., Junior Frontend Developer)
7. **Click "Start Interview"**
8. **Test it:**
   - Click "Start Recording" → speak a question
   - OR click "Switch to Text" → type a question
9. **End interview** → View evaluation report

## Verification Tests

### Test 1: Backend Health
```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok","message":"KAIRO Backend is running"}
```

### Test 2: LiveKit Token
```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/json" \
  -d '{"roomName":"test","participantName":"Test"}'
# Should return: {"token":"...", "roomName":"test"}
```

### Test 3: Get Personas
```bash
curl http://localhost:3000/api/personas
# Should return: [{"key":"junior-frontend-developer",...}]
```

## Common Issues & Fixes

### ❌ "OpenAI API key not configured"
**Fix:** Add `OPENAI_API_KEY=sk-...` to `.env` file

### ❌ "LiveKit not configured"
**Fix:** Add `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` to `.env`

### ❌ "MongoDB connection failed"
**Fix:** Start MongoDB: `brew services start mongodb-community`

### ❌ "Failed to connect to video room"
**Fix:** 
- Check LiveKit server is running
- Verify `LIVEKIT_URL` in `.env` matches your setup
- For cloud: use `wss://` (secure WebSocket)
- For local: use `ws://localhost:7880`

### ❌ "Port 3000 already in use"
**Fix:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### ❌ Frontend can't reach backend
**Fix:** Check `VITE_API_BASE_URL` in frontend `.env`:
```env
VITE_API_BASE_URL=http://localhost:3000/api
```

## What's Next?

✅ **Everything works?** Great! Try:
- All 3 candidate personas
- Both voice and text modes
- End interview and review evaluation
- Check OpenAI usage at https://platform.openai.com/usage

📚 **Learn more:**
- Backend details: `MOCK_HR_INTERVIEW_BACKEND_SETUP.md`
- Frontend details: `MOCK_HR_INTERVIEW.md` (in frontend folder)

💰 **Cost monitoring:**
- Check OpenAI usage: https://platform.openai.com/usage
- Each 15-min interview costs ~$0.50-$1.00
- Free tier: $5 credit (good for ~5-10 interviews)

## Architecture Overview

```
User Browser (http://localhost:5173)
    ↓
React Frontend
    ↓
LiveKit Video/Audio Room
    ↓
Backend API (http://localhost:3000)
    ↓
├─ OpenAI Whisper (Speech → Text)
├─ OpenAI GPT-4 (Generate AI Response)
└─ OpenAI TTS (Text → Speech)
    ↓
Play Audio Response in Browser
```

## Need Help?

1. **Check logs:**
   - Backend: Look at terminal running `npm run dev`
   - Frontend: Open browser console (F12)
   - LiveKit: Check LiveKit server logs

2. **Verify config:**
   ```bash
   # Backend .env
   cat /home/chakit/Hackathon/KAIRO/KAIRO-BACKEND/.env
   
   # Frontend .env
   cat /home/chakit/Hackathon/KAIRO/KAIRO-FRONTEND/.env
   ```

3. **Test individual components:**
   - MongoDB: `mongosh` (should connect)
   - Backend: `curl http://localhost:3000/api/health`
   - Frontend: Visit http://localhost:5173
   - LiveKit: `curl http://localhost:7880` (if local)

4. **Read full docs:**
   - Backend: `MOCK_HR_INTERVIEW_BACKEND_SETUP.md`
   - Frontend: `../KAIRO-FRONTEND/MOCK_HR_INTERVIEW.md`

## Success! 🎉

If you can:
- ✅ Start an interview
- ✅ Ask questions (voice or text)
- ✅ Hear AI responses
- ✅ See live transcript
- ✅ Get evaluation report

**You're all set!** The Mock HR Interview feature is working perfectly.

Happy interviewing! 🎤📹

