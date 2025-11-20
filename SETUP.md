# KAIRO Backend Setup Guide

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (running locally or MongoDB Atlas connection string)
- npm or yarn

## Installation Steps

1. **Install dependencies:**
```bash
cd KAIRO-BACKEND
npm install
```

2. **Set up environment variables:**
Create a `.env` file in the root directory:
```bash
# Copy from .env.example if available, or create manually
cp .env.example .env
```

Update the `.env` file with your configuration:
- `MONGODB_URI` - Your MongoDB connection string
- `JWT_SECRET` - A random secret string for JWT tokens
- `AI_PROVIDER` - "openai" or "anthropic"
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` - Your AI provider API key
- `FRONTEND_URL` - Frontend URL (default: http://localhost:5173)
- `PORT` - Backend port (default: 3000)

3. **Start MongoDB:**
Make sure MongoDB is running on your system or use MongoDB Atlas connection string.

4. **Run the backend:**
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

5. **Verify backend is running:**
Visit http://localhost:3000/api/health - you should see:
```json
{
  "status": "ok",
  "message": "KAIRO Backend is running"
}
```

## Testing the API

### 1. Sign Up (Create Account)
```bash
POST http://localhost:3000/api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "Test User"
}
```

Response includes `token` - save this for authentication.

### 2. Start Simulation
```bash
POST http://localhost:3000/api/simulation/start
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "role": "HR Executive"
}
```

This will:
- Create a new simulation session
- Assign the first HR task
- Send an initial message from the Manager persona

### 3. WebSocket Connection

For real-time chat, connect to Socket.io:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join simulation session
socket.emit('join_simulation', 'session-id');

// Send message
socket.emit('send_message', {
  message: 'Hello!',
  persona: 'Manager'
});
```

## HR Task Flow

When a user selects "HR Executive" role and starts a simulation:

1. **Task 1:** Write a Job Description for an HR Intern (beginner)
2. **Task 2:** Screen 10 resumes & shortlist top 3 candidates (beginner)
3. **Task 3:** Handle a conflict between two teammates (intermediate)
4. **Task 4:** Create a complete HR policy (advanced)

After each task submission, the AI evaluates and assigns the next task.

## Frontend Integration

The frontend should:
1. Get auth token from signup/login
2. Call `/api/simulation/start` with role "HR Executive"
3. Connect to Socket.io with the token
4. Join the simulation session
5. Send messages via Socket.io events

## Development Notes

- Authentication is required for all endpoints except `/api/auth/*`
- WebSocket connections also require authentication via token
- Tasks are fixed and defined in `src/services/task.service.js`
- AI responses use OpenAI or Anthropic (configure in `.env`)
- File uploads default to local storage (configure S3 in `.env` for production)

## Troubleshooting

1. **MongoDB Connection Error:**
   - Check MongoDB is running
   - Verify `MONGODB_URI` in `.env`

2. **JWT Errors:**
   - Ensure `JWT_SECRET` is set in `.env`
   - Token should be sent in `Authorization: Bearer <token>` header

3. **AI Not Responding:**
   - Check API keys are set correctly
   - Mock responses will be used if no AI provider is configured

4. **CORS Errors:**
   - Update `FRONTEND_URL` in `.env` to match your frontend URL

