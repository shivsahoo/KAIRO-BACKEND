# KAIRO Backend - AI HR Simulation MVP

Backend server for the AI HR Simulation MVP platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration (MongoDB URI, JWT secrets, AI API keys, etc.)

4. Start MongoDB (make sure MongoDB is running)

5. Seed HR tasks (optional):
```bash
npm run seed
```

6. Start development server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/google` - Google OAuth
- `GET /api/auth/me` - Get current user

### Simulation
- `POST /api/simulation/start` - Start simulation session
- `GET /api/simulation/:id` - Get simulation session
- `GET /api/simulation/:id/final-report` - Generate PDF report

### Tasks
- `GET /api/tasks/current` - Get current task
- `POST /api/tasks/submit` - Submit task
- `GET /api/tasks/all` - Get all tasks

### Upload
- `POST /api/upload/file` - Upload file
- `POST /api/upload/audio` - Upload audio

### Audio
- `POST /api/audio/stt` - Speech-to-text (stub)
- `POST /api/audio/tts` - Text-to-speech (stub)

## WebSocket Events

### Client -> Server
- `send_message` - Send chat message
- `send_audio` - Send audio message
- `typing` - Typing indicator

### Server -> Client
- `new_message` - New message received
- `persona_typing` - Persona typing indicator
- `task_assigned` - New task assigned
- `task_scored` - Task evaluation completed

## Tech Stack

- Node.js (Express)
- MongoDB (Mongoose)
- Socket.io (WebSockets)
- JWT (Authentication)
- AWS S3 / Local Storage (File uploads)
- OpenAI / Anthropic (AI responses)
- PDFKit (Report generation)

