# KAIRO Postman Collection - Quick Start Guide

## 📦 What's Included

This directory contains a complete Postman collection for the KAIRO Backend API:

1. **KAIRO_API.postman_collection.json** - Complete Postman collection with all endpoints
2. **API_DOCUMENTATION.md** - Comprehensive API documentation
3. **POSTMAN_COLLECTION_README.md** - This quick start guide

## 🚀 Quick Start

### Step 1: Import Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select `KAIRO_API.postman_collection.json`
4. Collection will be imported with all folders and variables

### Step 2: Configure Variables

The collection includes pre-configured variables:

- **base_url**: `http://localhost:3000` (update if your server runs on different port)
- **bearer_token**: Auto-set after login (no manual setup needed)
- **session_id**: Auto-set after starting simulation (no manual setup needed)
- **user_id**: Auto-set after login (no manual setup needed)

To update `base_url`:
1. Click on collection name: **KAIRO API Collection**
2. Go to **Variables** tab
3. Update `base_url` value if needed

### Step 3: Test the API

1. **Health Check** → Verify server is running
2. **Login** → Get authentication token (automatically saved)
3. **Start Simulation** → Create a session (automatically saves session_id)
4. **Get Current Task** → View assigned task
5. **Submit Task** → Complete and submit tasks

## ✨ Key Features

### Automatic Token Management

The **Login** endpoint includes a post-script that:
- ✅ Extracts token from response
- ✅ Saves to `bearer_token` variable
- ✅ Saves user ID to `user_id` variable
- ✅ Logs success message to console

### Automatic Session Management

The **Start Simulation** endpoint includes a post-script that:
- ✅ Extracts session ID from response
- ✅ Saves to `session_id` variable
- ✅ Logs success message to console

### Organized Folders

Endpoints are organized by use case:
- 🔐 **Authentication** - Sign up, login, profile
- 🎮 **Simulation** - Session management
- 📋 **Tasks** - Task viewing and submission
- 📤 **Upload** - File and audio uploads
- 🎤 **Audio** - Speech-to-text and text-to-speech
- ❤️ **Health Check** - Server status

## 📝 Example Workflow

### Complete User Journey

```
1. POST /api/auth/login
   → Token saved automatically ✅

2. GET /api/auth/me
   → Verify authentication ✅

3. POST /api/simulation/start
   → Session ID saved automatically ✅
   Body: { "role": "HR Executive" }

4. GET /api/tasks/current
   → View current task ✅

5. POST /api/tasks/submit
   → Submit task with evaluation ✅
   Body: {
     "text": "Task submission...",
     "files": ["https://..."],
     "audioUrl": "https://..."
   }

6. GET /api/simulation/:id
   → View session details ✅

7. POST /api/simulation/:id/end
   → End simulation ✅

8. GET /api/simulation/:id/final-report
   → Download PDF report ✅
```

## 🔑 Authentication

Most endpoints require Bearer token authentication. The token is automatically included in requests using:

```
Authorization: Bearer {{bearer_token}}
```

**Important:** Always run the **Login** endpoint first to get a token before accessing protected endpoints.

## 📚 Documentation

For detailed API documentation, see:
- **API_DOCUMENTATION.md** - Complete endpoint reference with examples

## 🛠️ Troubleshooting

### Token Not Working

1. Check that `bearer_token` variable is set (after login)
2. Verify token in collection variables
3. Try logging in again

### Session ID Not Found

1. Check that `session_id` variable is set (after starting simulation)
2. Verify session ID in collection variables
3. Start a new simulation

### Base URL Issues

1. Update `base_url` variable in collection
2. Default is `http://localhost:3000`
3. Change if your server runs on different port/domain

### Request Fails

1. Check server is running (`/api/health`)
2. Verify request body format matches documentation
3. Check authentication token is valid
4. Review error response for details

## 📋 Collection Structure

```
KAIRO API Collection
├── Authentication
│   ├── Sign Up
│   ├── Login (with post-script)
│   ├── Get Current User
│   └── Google OAuth
├── Simulation
│   ├── Start Simulation (with post-script)
│   ├── Get Simulation Session
│   ├── Generate Final Report (PDF)
│   └── End Simulation
├── Tasks
│   ├── Get Current Task
│   ├── Submit Task
│   └── Get All Tasks
├── Upload
│   ├── Upload File
│   └── Upload Audio
├── Audio
│   ├── Speech to Text (STT)
│   └── Text to Speech (TTS)
└── Health Check
```

## 🔌 WebSocket Support

The KAIRO backend also supports **WebSocket connections** via Socket.io for real-time communication during simulations. While Postman doesn't natively support WebSocket testing, you can use the REST API to:

1. **Get your token** - Use Login endpoint
2. **Start a simulation** - Get session ID
3. **Connect via WebSocket** - Use Socket.io client in your application

### WebSocket Events

**Client → Server:**
- `join_simulation` - Join a simulation session
- `send_message` - Send chat message to AI personas
- `send_audio` - Send audio message
- `typing` - Send typing indicator

**Server → Client:**
- `new_message` - New message received
- `persona_typing` - AI persona typing indicator
- `message_start` - AI response started (streaming)
- `message_chunk` - Streaming response chunks
- `message_complete` - AI response completed
- `message_saved` - Message saved with database ID
- `task_assigned` - New task assigned
- `task_scored` - Task evaluation completed
- `session_ended` - Session ended
- `error` - Error occurred

For complete WebSocket documentation, see **API_DOCUMENTATION.md** section on WebSocket Events.

### Testing WebSockets

To test WebSocket connections, you can use:
- **Browser Console** - Connect using Socket.io client library
- **Postman** - Use the WebSocket request feature (if available in your version)
- **Custom Client** - Build a simple test client using Socket.io

Example connection:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

socket.emit('join_simulation', 'session-id');
socket.emit('send_message', { message: 'Hello!' });
```

## 🎯 Tips

1. **Use Collection Runner**: Run multiple requests in sequence
2. **Save Responses**: Save example responses for reference
3. **Create Environments**: Use Postman environments for different environments (dev, staging, prod)
4. **Export Collection**: Share collection with team members
5. **Use Pre-request Scripts**: Add custom logic if needed

## 📞 Support

For issues:
1. Check API_DOCUMENTATION.md for endpoint details
2. Verify server logs for errors
3. Check Postman console for script execution logs
4. Ensure all environment variables are set correctly

---

**Happy Testing! 🚀**

