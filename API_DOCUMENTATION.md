# KAIRO API Documentation

Complete API documentation for KAIRO Backend - AI HR Simulation Platform.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Postman Collection](#postman-collection)
5. [Variables](#variables)
6. [Use Cases](#use-cases)
7. [Error Handling](#error-handling)

---

## Getting Started

### Base URL

Default: `http://localhost:3000`

You can change this in the Postman collection variables.

### Import Postman Collection

1. Open Postman
2. Click **Import** button
3. Select `KAIRO_API.postman_collection.json`
4. The collection will be imported with all folders, variables, and scripts

### Quick Start

1. **Set Base URL**: Update `base_url` variable if your server runs on a different port
2. **Sign Up or Login**: Use the Authentication endpoints to get a token
3. **Start Simulation**: Create a new simulation session
4. **Submit Tasks**: Complete and submit tasks during simulation

---

## Authentication

Most endpoints require Bearer token authentication. The token is obtained through the login endpoint and automatically saved to the `bearer_token` variable.

### Authentication Flow

1. **Sign Up** or **Login** to get a JWT token
2. Token is automatically saved to `bearer_token` collection variable
3. All subsequent requests use this token in the Authorization header

### Token Format

```
Authorization: Bearer <token>
```

---

## API Endpoints

### 1. Authentication Endpoints

#### POST `/api/auth/signup`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Validation:**
- `email`: Must be a valid email address
- `password`: Minimum 6 characters
- `name`: Required, non-empty string

**Response (201):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "roleSelected": null
  }
}
```

**Post-Script:** Automatically saves token to `bearer_token` variable.

---

#### POST `/api/auth/login`

Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Validation:**
- `email`: Must be a valid email address
- `password`: Required, non-empty string

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "roleSelected": "HR Executive"
  }
}
```

**Post-Script:** 
- Automatically saves token to `bearer_token` variable
- Saves user ID to `user_id` variable
- Logs success message to console

**Error Responses:**
- `400`: Validation errors
- `401`: Invalid credentials

---

#### GET `/api/auth/me`

Get current authenticated user's information.

**Authentication:** Required (Bearer token)

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "name": "John Doe",
  "roleSelected": "HR Executive",
  "authProvider": "local"
}
```

**Error Responses:**
- `401`: Unauthorized (invalid or missing token)
- `404`: User not found

---

#### POST `/api/auth/google`

Google OAuth authentication (stub - not yet implemented).

**Status:** Returns `501 Not Implemented`

---

### 2. Simulation Endpoints

#### POST `/api/simulation/start`

Start a new simulation session.

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "role": "HR Executive"
}
```

**Validation:**
- `role`: Must be either `"HR Executive"` or `"Business Analyst"`

**Response (201):**
```json
{
  "sessionId": "507f1f77bcf86cd799439011",
  "context": {
    "role": "HR Executive",
    "department": "Human Resources",
    "currentScenario": "Write a Job Description for an HR Intern",
    "objectives": [
      "Complete assigned tasks",
      "Interact with team members",
      "Demonstrate professional skills"
    ]
  },
  "initialMessage": {
    "id": "msg-1234567890",
    "type": "ai",
    "content": "Welcome to the HR Team, John! I'm Sarah, your manager...",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "sender": "Sarah (Manager)"
  },
  "tasks": [
    {
      "id": "hr_t1",
      "title": "Write a Job Description for an HR Intern",
      "description": "Create a comprehensive job description...",
      "status": "pending",
      "priority": "medium"
    }
  ]
}
```

**Post-Script:** Automatically saves `sessionId` to `session_id` variable.

**Error Responses:**
- `400`: Invalid role or active session already exists
- `401`: Unauthorized

---

#### GET `/api/simulation/:id`

Get simulation session details and messages.

**Authentication:** Required (Bearer token)

**Path Parameters:**
- `id`: Simulation session ID

**Response (200):**
```json
{
  "session": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "role": "HR Executive",
    "status": "active",
    "currentTaskIndex": 0,
    "timeline": [...],
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "messages": [
    {
      "_id": "msg-1234567890",
      "simulationId": "507f1f77bcf86cd799439011",
      "sender": "manager",
      "persona": "Manager",
      "text": "Welcome to the HR Team...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: Simulation session not found

---

#### GET `/api/simulation/:id/final-report`

Generate and download final PDF report.

**Authentication:** Required (Bearer token)

**Path Parameters:**
- `id`: Simulation session ID

**Response (200):**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename=kairo-report-{sessionId}.pdf`
- Binary PDF file

**Error Responses:**
- `401`: Unauthorized
- `404`: Simulation session not found
- `500`: Server error generating PDF

---

#### POST `/api/simulation/:id/end`

End an active simulation session.

**Authentication:** Required (Bearer token)

**Path Parameters:**
- `id`: Simulation session ID

**Response (200):**
```json
{
  "message": "Simulation ended successfully",
  "session": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "ended",
    "endedAt": "2024-01-01T01:00:00.000Z",
    ...
  }
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: Active session not found

---

### 3. Task Endpoints

#### GET `/api/tasks/current`

Get the current active task for the user's active simulation session.

**Authentication:** Required (Bearer token)

**Response (200):**
```json
{
  "task": {
    "id": "hr_t1",
    "title": "Write a Job Description for an HR Intern",
    "description": "Create a comprehensive job description...",
    "level": "beginner",
    "expectedOutput": "A complete job description document...",
    "status": "pending"
  },
  "taskIndex": 0
}
```

**Response (200) - All tasks completed:**
```json
{
  "message": "All tasks completed",
  "task": null
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: No active simulation session

---

#### POST `/api/tasks/submit`

Submit a task for evaluation.

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "text": "Task submission text content",
  "files": [
    "https://example.com/file1.pdf",
    "https://example.com/file2.docx"
  ],
  "audioUrl": "https://example.com/audio.mp3"
}
```

**All fields are optional**, but at least one should be provided.

**Response (201):**
```json
{
  "submission": {
    "id": "507f1f77bcf86cd799439013",
    "taskId": "hr_t1",
    "score": 85,
    "feedback": "Great job on the job description...",
    "improvements": [
      "Consider adding more specific requirements",
      "Include salary range information"
    ]
  },
  "nextTask": {
    "id": "hr_t2",
    "title": "Screen 10 resumes & shortlist top 3 candidates",
    "description": "...",
    "level": "beginner",
    "expectedOutput": "...",
    "status": "pending"
  },
  "completed": false
}
```

**Response (201) - All tasks completed:**
```json
{
  "submission": {...},
  "nextTask": null,
  "completed": true
}
```

**Error Responses:**
- `400`: No current task to submit
- `401`: Unauthorized
- `404`: No active simulation session
- `500`: Server error during evaluation

---

#### GET `/api/tasks/all`

Get all available tasks in the system.

**Authentication:** Required (Bearer token)

**Response (200):**
```json
{
  "tasks": [
    {
      "id": "hr_t1",
      "title": "Write a Job Description for an HR Intern",
      "description": "...",
      "level": "beginner",
      "expectedOutput": "..."
    },
    {
      "id": "hr_t2",
      "title": "Screen 10 resumes & shortlist top 3 candidates",
      "description": "...",
      "level": "beginner",
      "expectedOutput": "..."
    },
    ...
  ]
}
```

---

### 4. Upload Endpoints

#### POST `/api/upload/file`

Upload a file to the server.

**Authentication:** Required (Bearer token)

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `file`
- Accepts any file type

**Response (200):**
```json
{
  "url": "https://example.com/uploads/files/filename.pdf",
  "filename": "document.pdf",
  "size": 102400,
  "mimetype": "application/pdf"
}
```

**Error Responses:**
- `400`: No file uploaded
- `401`: Unauthorized
- `500`: Server error during upload

---

#### POST `/api/upload/audio`

Upload an audio file to the server.

**Authentication:** Required (Bearer token)

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `audio`
- Accepts audio file formats

**Response (200):**
```json
{
  "url": "https://example.com/uploads/audio/recording.mp3",
  "filename": "recording.mp3",
  "size": 51200,
  "mimetype": "audio/mpeg"
}
```

**Error Responses:**
- `400`: No audio file uploaded
- `401`: Unauthorized
- `500`: Server error during upload

---

### 5. Audio Endpoints

#### POST `/api/audio/stt`

Convert speech to text (stub implementation).

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "audioUrl": "https://example.com/audio.mp3"
}
```

**Response (200):**
```json
{
  "text": "Transcribed text (stub) - This is a placeholder response...",
  "confidence": 0.95
}
```

**Status:** Currently returns stub response. In production, would integrate with Whisper API or similar STT service.

---

#### POST `/api/audio/tts`

Convert text to speech (stub implementation).

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "text": "Hello, this is a test message",
  "voice": "default"
}
```

**Response (200):**
```json
{
  "audioUrl": "/static/ai-response.mp3",
  "text": "Hello, this is a test message",
  "voice": "default",
  "duration": 2
}
```

**Status:** Currently returns stub response. In production, would integrate with OpenAI TTS, Google TTS, or similar service.

---

### 6. Health Check

#### GET `/api/health`

Health check endpoint to verify server is running.

**No authentication required.**

**Response (200):**
```json
{
  "status": "ok",
  "message": "KAIRO Backend is running"
}
```

---

## Postman Collection

### Collection Structure

The Postman collection is organized into the following folders:

1. **Authentication** - User registration, login, and profile
2. **Simulation** - Simulation session management
3. **Tasks** - Task viewing and submission
4. **Upload** - File and audio uploads
5. **Audio** - Speech-to-text and text-to-speech
6. **Health Check** - Server health verification

### Collection Variables

The collection includes the following variables:

| Variable | Default Value | Description |
|----------|--------------|-------------|
| `base_url` | `http://localhost:3000` | Base URL of the API |
| `bearer_token` | (empty) | JWT authentication token (auto-set after login) |
| `session_id` | (empty) | Current simulation session ID (auto-set after starting simulation) |
| `user_id` | (empty) | Current user ID (auto-set after login) |

### Automatic Variable Management

The collection includes post-scripts that automatically manage variables:

1. **Login/Signup**: Automatically saves `bearer_token` and `user_id` from response
2. **Start Simulation**: Automatically saves `session_id` from response

### Using Variables

Variables are used in requests using the `{{variable_name}}` syntax:

- URL: `{{base_url}}/api/auth/login`
- Header: `Bearer {{bearer_token}}`
- Path parameter: `/api/simulation/{{session_id}}`

---

## Variables

### Setting Variables Manually

If you need to set variables manually:

1. Click on the collection name
2. Go to the **Variables** tab
3. Edit the values as needed

### Variable Scope

- **Collection Variables**: Available to all requests in the collection
- **Environment Variables**: Can be used if you create a Postman environment

---

## Use Cases

### Use Case 1: Complete User Flow

1. **Sign Up** → Get token automatically saved
2. **Get Current User** → Verify authentication
3. **Start Simulation** → Create session (role: "HR Executive")
4. **Get Current Task** → View assigned task
5. **Submit Task** → Submit task with text/files
6. **Get Current Task** → View next task
7. **End Simulation** → Complete session
8. **Generate Final Report** → Download PDF

### Use Case 2: File Upload Workflow

1. **Login** → Get authentication token
2. **Start Simulation** → Create session
3. **Upload File** → Upload document (e.g., PDF)
4. **Submit Task** → Include file URL in submission
5. **View Results** → Check task evaluation

### Use Case 3: Audio Workflow

1. **Login** → Get authentication token
2. **Start Simulation** → Create session
3. **Upload Audio** → Upload audio recording
4. **Speech to Text** → Convert audio to text (stub)
5. **Submit Task** → Include transcribed text

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "message": "Invalid role",
  "errors": [...]
}
```

#### 401 Unauthorized
```json
{
  "message": "No token provided, authorization denied"
}
```
or
```json
{
  "message": "Invalid credentials"
}
```

#### 404 Not Found
```json
{
  "message": "Simulation session not found"
}
```

#### 500 Internal Server Error
```json
{
  "message": "Server error",
  "error": "Error details..."
}
```

### Error Handling Tips

1. **Check Token**: Ensure `bearer_token` is set after login
2. **Check Session**: Ensure `session_id` is set after starting simulation
3. **Validate Input**: Check request body matches expected format
4. **Check Status Codes**: Review response status codes for specific errors

---

## WebSocket Events

The backend also supports WebSocket connections for real-time communication. These are not included in the REST API collection but are documented here for reference.

### Client → Server Events

- `join_simulation` - Join a simulation session room
- `send_message` - Send a chat message
- `send_audio` - Send an audio message
- `typing` - Send typing indicator

### Server → Client Events

- `new_message` - New message received
- `persona_typing` - Persona typing indicator
- `task_assigned` - New task assigned
- `task_scored` - Task evaluation completed

---

## Notes

1. **Development Mode**: Some endpoints (like simulation start) may work without authentication in development mode
2. **Stub Endpoints**: Audio endpoints (STT/TTS) and Google OAuth are currently stubs
3. **File Storage**: Uploaded files are stored in S3 or local storage based on configuration
4. **AI Evaluation**: Task submissions are evaluated using AI (OpenAI/Anthropic)

---

## Support

For issues or questions:
1. Check the server logs for detailed error messages
2. Verify environment variables are set correctly
3. Ensure MongoDB is running (if using database)
4. Check that all required dependencies are installed

---

**Last Updated:** 2024
**API Version:** 1.0.0

