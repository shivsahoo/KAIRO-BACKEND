# Frontend Update Guide - KAIRO Backend Changes

This document outlines all API changes, response structure updates, and new features that need to be implemented in the frontend.

## Table of Contents
1. [API Response Changes](#api-response-changes)
2. [Scoring System](#scoring-system)
3. [Task Progression Logic](#task-progression-logic)
4. [Task Submission & Resubmission](#task-submission--resubmission)
5. [Resume Screening Task (hr_t2)](#resume-screening-task-hr_t2)
6. [WebSocket Events](#websocket-events)

---

## API Response Changes

### 1. Start Simulation API (`POST /api/simulation/start`)

#### Updated Response Structure

**For New Sessions:**
```json
{
  "sessionId": "507f1f77bcf86cd799439011",
  "context": {
    "role": "HR Executive",
    "department": "Human Resources",
    "currentScenario": "Write a Job Description for an HR Intern",
    "objectives": [...]
  },
  "welcomeMessage": {
    "id": "welcome-1234567890",
    "type": "ai",
    "content": "Welcome to the team, John! I'm Sarah Chen, your HR Manager...",
    "timestamp": "2024-01-15T10:00:00.000Z",
    "sender": "Sarah (Manager)"
  },
  "initialMessage": {
    "id": "msg-1234567890",
    "type": "ai",
    "content": "Welcome to the HR Team! Here's your first task...",
    "timestamp": "2024-01-15T10:00:00.000Z",
    "sender": "Sarah (Manager)"
  },
  "tasks": [
    {
      "id": "hr_t1",
      "title": "Write a Job Description for an HR Intern",
      "description": "Draft a clear JD including responsibilities, skills, and qualifications.",
      "level": "beginner",
      "expectedOutput": "A structured JD in text or DOCX/PDF",
      "status": "pending"
    }
  ]
}
```

**For Existing Sessions:**
```json
{
  "sessionId": "507f1f77bcf86cd799439011",
  "context": {...},
  "welcomeMessage": {
    "id": "welcome-...",
    "type": "ai",
    "content": "Welcome back, John! Let's continue working on your HR tasks.",
    "timestamp": "...",
    "sender": "Sarah (Manager)"
  },
  "initialMessage": {...},
  "tasks": [
    {
      "id": "hr_t1",
      "title": "Write a Job Description for an HR Intern",
      "description": "...",
      "level": "beginner",
      "expectedOutput": "...",
      "status": "completed",
      "score": 8,
      "feedback": "Excellent job description...",
      "improvements": ["Add more specific qualifications"],
      "submittedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "hr_t2",
      "title": "Screen 10 resumes & shortlist top 3 candidates",
      "description": "...",
      "level": "beginner",
      "expectedOutput": "...",
      "status": "completed",
      "score": 9,
      "feedback": "Great selection...",
      "improvements": ["Provide more detailed justification"],
      "submittedAt": "2024-01-16T14:20:00.000Z"
    },
    {
      "id": "hr_t3",
      "title": "Handle a conflict between two teammates",
      "description": "...",
      "level": "intermediate",
      "expectedOutput": "...",
      "status": "pending"
    }
  ]
}
```

**Key Changes:**
- ✅ Added `welcomeMessage` object (hardcoded greeting, not task assignment)
- ✅ Added `tasks` array containing ALL tasks (completed + current)
- ✅ Removed separate `previousTask` and `currentTask` objects
- ✅ Completed tasks include: `score`, `feedback`, `improvements`, `submittedAt`
- ✅ Tasks array shows highest score for each completed task (not just latest)

---

### 2. Get Current Task API (`GET /api/tasks/current`)

#### Updated Response Structure

```json
{
  "tasks": [
    {
      "id": "hr_t1",
      "title": "Write a Job Description for an HR Intern",
      "description": "...",
      "level": "beginner",
      "expectedOutput": "...",
      "status": "completed",
      "score": 8,
      "feedback": "Excellent job description...",
      "improvements": ["Add more specific qualifications"],
      "submittedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "hr_t2",
      "title": "Screen 10 resumes & shortlist top 3 candidates",
      "description": "...",
      "level": "beginner",
      "expectedOutput": "...",
      "status": "pending"
    }
  ],
  "currentTask": {
    "id": "hr_t2",
    "title": "Screen 10 resumes & shortlist top 3 candidates",
    "description": "...",
    "level": "beginner",
    "expectedOutput": "...",
    "status": "pending"
  },
  "taskIndex": 1,
  "allTasksCompleted": false,
  "jobDescription": {
    "text": "Job Title: Python Developer\n\nPosition Overview:...",
    "files": [],
    "submittedAt": null
  },
  "resumes": [
    {
      "id": "507f1f77bcf86cd799439011",
      "candidateName": "John Smith",
      "email": "john@example.com",
      "phone": "+1-555-1234",
      "experience": 3,
      "skills": ["Python", "Django", "Flask", "SQL"],
      "education": "Bachelor of Science in Computer Science",
      "summary": "Experienced Python developer...",
      "workHistory": [...],
      "resumeText": "Full formatted resume text..."
    },
    ...
  ]
}
```

**Key Changes:**
- ✅ Now returns `tasks` array with ALL tasks (completed + current)
- ✅ Completed tasks show highest score achieved (not latest)
- ✅ For hr_t2, includes `jobDescription` (hardcoded Python Developer JD)
- ✅ For hr_t2, includes `resumes` array (10 shared resumes)
- ✅ `jobDescription` is hardcoded for hr_t2 (no longer from hr_t1)

**Field Descriptions:**
- `tasks`: Array of all tasks up to and including current task
- `currentTask`: Current active task object (for backward compatibility)
- `taskIndex`: Current task index (0-based)
- `allTasksCompleted`: Boolean indicating if all tasks are done
- `jobDescription`: Only for hr_t2, hardcoded Python Developer JD
- `resumes`: Only for hr_t2, array of 10 shared resumes

---

## Scoring System

### Score Scale: 0-10 (Previously 0-100)

**Important:** Scoring scale has been changed from 0-100 to 0-10.

### Passing Score: 5

- ✅ **Score >= 5**: User can proceed to next task
- ❌ **Score < 5**: User must stay on current task and resubmit

### Task Progression Rules

1. **Score < 5**: 
   - Cannot proceed to next task
   - Must resubmit to improve score
   - Response includes: `canProceed: false`

2. **Score >= 5**:
   - Can proceed to next task
   - Automatically moves to next task
   - Response includes: `canProceed: true`
   - Receives `nextTask` and `nextTaskMessage`

---

## Task Progression Logic

### Submit Task Response (`POST /api/tasks/submit`)

```json
{
  "submission": {
    "id": "507f1f77bcf86cd799439011",
    "taskId": "hr_t1",
    "score": 7,
    "feedback": "Good submission...",
    "improvements": ["Add more details", "Be more specific"]
  },
  "canProceed": true,
  "message": "Great work! You scored 7/10. You can proceed to the next task.",
  "nextTask": {
    "id": "hr_t2",
    "title": "Screen 10 resumes & shortlist top 3 candidates",
    "description": "...",
    "level": "beginner",
    "expectedOutput": "...",
    "status": "pending"
  },
  "nextTaskMessage": {
    "id": "msg-1234567890",
    "type": "ai",
    "content": "Great work on completing the previous task! Now I have a new assignment...",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "sender": "Sarah (Manager)"
  },
  "completed": false,
  "scoreInfo": {
    "min": 0,
    "max": 10,
    "passingScore": 5,
    "currentScore": 7,
    "scoreRange": "excellent" // or "needs_decision" or "rejected"
  }
}
```

**Key Fields:**
- `canProceed`: Boolean - Whether user can move to next task
- `message`: Status message explaining the result
- `nextTask`: Next task object (if `canProceed` is true)
- `nextTaskMessage`: AI-generated message for new task (if applicable)
- `scoreInfo`: Score details including range and thresholds

**Score Ranges:**
- `rejected`: Score < 5 (cannot proceed)
- `needs_decision`: Score 5-7 (can proceed, optional for frontend)
- `excellent`: Score >= 5 (can proceed)

---

## Task Submission & Resubmission

### Submit Task Request (`POST /api/tasks/submit`)

**For Regular Tasks (hr_t1, hr_t3, hr_t4):**
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

**For Resume Screening Task (hr_t2):**
```json
{
  "text": "After reviewing all 10 resumes, I have selected the top 3 candidates...",
  "selectedResumes": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ],
  "resumeRatings": [
    {
      "resumeId": "507f1f77bcf86cd799439011",
      "rating": 9,
      "notes": "Excellent Python developer with strong Django experience"
    },
    {
      "resumeId": "507f1f77bcf86cd799439012",
      "rating": 8,
      "notes": "Good fit for the role"
    },
    {
      "resumeId": "507f1f77bcf86cd799439013",
      "rating": 7,
      "notes": "Solid candidate"
    }
  ],
  "files": [],
  "audioUrl": null
}
```

**Required Fields:**
- `text`: Justification text (required)
- `selectedResumes`: Array of 3 resume IDs (required for hr_t2)
- `resumeRatings`: Array of rating objects (optional but recommended for hr_t2)

**Optional Fields:**
- `files`: Array of file URLs
- `audioUrl`: URL to audio file
- `isFinalSubmission`: Boolean (for future use with 50-70 score range)

---

### Resubmit Task API (`POST /api/tasks/resubmit/:taskId`)

**New Endpoint** for users to resubmit tasks to improve their score.

**Request:**
```
POST /api/tasks/resubmit/hr_t1
```

**Body:** Same as submit task request

**Response:** Same structure as submit task, but includes:
```json
{
  "submission": {
    "id": "...",
    "taskId": "hr_t1",
    "score": 8,
    "feedback": "...",
    "improvements": [...],
    "isResubmission": true  // ✅ New flag
  },
  "canProceed": true,
  "message": "...",
  "nextTask": {...},
  ...
}
```

**Key Points:**
- Users can resubmit any task multiple times
- Each resubmission creates a new submission record
- Response shows highest score for that task
- `isResubmission` flag indicates this is a resubmission

---

## Resume Screening Task (hr_t2)

### Job Description

**Changed:** hr_t2 now uses a **hardcoded Python Developer job description** instead of using the JD from hr_t1.

The job description is automatically included in the response for hr_t2:
```json
{
  "jobDescription": {
    "text": "Job Title: Python Developer\n\nPosition Overview:\nWe are seeking an experienced Python Developer...",
    "files": [],
    "submittedAt": null
  }
}
```

### Resumes

**Changed:** Resumes are now **shared across all users** and **pre-generated** when the app starts.

- ✅ 10 resumes are generated once on app startup
- ✅ Same resumes shown to all users
- ✅ Resumes include: 3 good Python developers, 2 other tech stack, 5 mixed quality
- ✅ No waiting time for resume generation
- ✅ Instant task assignment

**Resume Structure:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "candidateName": "John Smith",
  "email": "john@example.com",
  "phone": "+1-555-1234",
  "experience": 3,
  "skills": ["Python", "Django", "Flask", "SQL", "Git"],
  "education": "Bachelor of Science in Computer Science",
  "summary": "Experienced Python developer with 3 years of experience...",
  "workHistory": [
    {
      "company": "Tech Corp",
      "position": "Python Developer",
      "duration": "01/2021 - Present",
      "description": "Developed web applications using Django..."
    }
  ],
  "resumeText": "Full formatted resume text..."
}
```

**Note:** Resume objects do NOT include `quality` or `relevance` fields (hidden from users).

---

## WebSocket Events

### Client -> Server Events

#### `join_simulation`
Join a simulation session room.

```javascript
socket.emit('join_simulation', sessionId);
```

#### `send_message`
Send a chat message to the AI persona.

```javascript
socket.emit('send_message', {
  sessionId: '507f1f77bcf86cd799439011',
  text: 'Hello, I need help with...',
  persona: 'Manager' // optional
});
```

#### `send_audio`
Send an audio message.

```javascript
socket.emit('send_audio', {
  sessionId: '507f1f77bcf86cd799439011',
  audioUrl: 'https://example.com/audio.mp3',
  persona: 'Manager' // optional
});
```

#### `typing`
Send typing indicator.

```javascript
socket.emit('typing', {
  sessionId: '507f1f77bcf86cd799439011',
  isTyping: true
});
```

---

### Server -> Client Events

#### `new_message`
New message received (from user or AI persona).

```javascript
socket.on('new_message', (message) => {
  // message: {
  //   id: "message_id",
  //   type: "user" | "ai",
  //   content: "Message text",
  //   timestamp: "2024-01-15T10:00:00.000Z",
  //   sender: "User Name" | "Sarah (Manager)"
  // }
});
```

#### `persona_typing`
AI persona typing indicator.

```javascript
socket.on('persona_typing', (data) => {
  // data: {
  //   persona: "Manager",
  //   isTyping: true
  // }
});
```

#### `task_assigned`
New task assigned to user.

```javascript
socket.on('task_assigned', (data) => {
  // data: {
  //   task: {
  //     id: "hr_t2",
  //     title: "Screen 10 resumes...",
  //     description: "...",
  //     level: "beginner",
  //     expectedOutput: "...",
  //     status: "pending"
  //   }
  // }
});
```

#### `task_scored`
Task evaluation completed.

```javascript
socket.on('task_scored', (data) => {
  // data: {
  //   taskId: "hr_t1",
  //   score: 7, // 0-10 scale
  //   feedback: "Detailed feedback...",
  //   improvements: ["Improvement 1", "Improvement 2"],
  //   isResubmission: false // true if resubmission
  // }
});
```

#### `session_ended`
Simulation session ended.

```javascript
socket.on('session_ended', (data) => {
  // data: {
  //   sessionId: "507f1f77bcf86cd799439011",
  //   endedAt: "2024-01-15T10:00:00.000Z"
  // }
});
```

#### `error`
Error occurred.

```javascript
socket.on('error', (error) => {
  // error: {
  //   message: "Error message",
  //   code: "ERROR_CODE" // optional
  // }
});
```

---

## Frontend Implementation Checklist

### 1. Start Simulation
- [ ] Handle `welcomeMessage` separately from `initialMessage`
- [ ] Display `tasks` array showing all completed + current tasks
- [ ] Show scores, feedback, and improvements for completed tasks
- [ ] Handle existing session response with all tasks

### 2. Task Display
- [ ] Show all tasks in a list/table view
- [ ] Display status (completed/pending) for each task
- [ ] Show highest score for completed tasks
- [ ] Display feedback and improvements for completed tasks

### 3. Task Submission
- [ ] Update scoring display to 0-10 scale (not 0-100)
- [ ] Check `canProceed` flag before showing next task
- [ ] Display `message` explaining the result
- [ ] Handle `scoreInfo` to show score range
- [ ] Show `nextTaskMessage` when new task is assigned

### 4. Resume Screening (hr_t2)
- [ ] Display hardcoded Python Developer job description
- [ ] Show 10 shared resumes from API
- [ ] Allow user to select 3 resumes
- [ ] Allow user to rate selected resumes (1-10)
- [ ] Include `selectedResumes` and `resumeRatings` in submission

### 5. Resubmission
- [ ] Add "Resubmit" button for tasks with score < 5
- [ ] Implement resubmit API call: `POST /api/tasks/resubmit/:taskId`
- [ ] Handle `isResubmission` flag in response
- [ ] Update task score display with new highest score

### 6. Scoring & Progression
- [ ] Display score on 0-10 scale
- [ ] Show passing threshold (5) clearly
- [ ] Block progression if score < 5
- [ ] Allow progression if score >= 5
- [ ] Show appropriate messages based on score

### 7. WebSocket Integration
- [ ] Listen for `task_assigned` event to update task list
- [ ] Listen for `task_scored` event to show evaluation
- [ ] Listen for `new_message` event for task assignment messages
- [ ] Handle `persona_typing` for loading indicators

---

## API Endpoints Summary

### Authentication
- `POST /api/auth/signup` - Sign up
- `POST /api/auth/login` - Login (saves token automatically)
- `GET /api/auth/me` - Get current user

### Simulation
- `POST /api/simulation/start` - Start/Get existing session
- `GET /api/simulation/:id` - Get session details
- `GET /api/simulation/:id/final-report` - Generate PDF report
- `POST /api/simulation/:id/end` - End session

### Tasks
- `GET /api/tasks/current` - Get current task + all previous tasks
- `POST /api/tasks/submit` - Submit task
- `POST /api/tasks/resubmit/:taskId` - **NEW** - Resubmit task
- `GET /api/tasks/all` - Get all available tasks

### Upload
- `POST /api/upload/file` - Upload file
- `POST /api/upload/audio` - Upload audio

---

## Migration Notes

### Breaking Changes
1. **Scoring Scale**: Changed from 0-100 to 0-10
   - Update all score displays
   - Update progress bars/indicators
   - Update passing threshold checks

2. **Task Response Structure**:
   - Removed `previousTask` and `currentTask` separate objects
   - Now returns `tasks` array with all tasks
   - Keep `currentTask` for backward compatibility (but prefer `tasks` array)

3. **hr_t2 Job Description**:
   - No longer uses JD from hr_t1
   - Now uses hardcoded Python Developer JD
   - Update frontend to use `jobDescription` from API response

### Non-Breaking Changes
1. **Welcome Message**: New field, can be displayed separately
2. **Resubmit API**: New endpoint, optional feature
3. **Task Evaluation Data**: Additional fields on completed tasks
4. **Resume Generation**: Now shared and pre-generated (transparent to frontend)

---

## Example Frontend Code Snippets

### Handling Start Simulation Response
```javascript
const startSimulation = async (role) => {
  const response = await fetch('/api/simulation/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ role })
  });
  
  const data = await response.json();
  
  // Display welcome message (separate from initial message)
  if (data.welcomeMessage) {
    displayMessage(data.welcomeMessage);
  }
  
  // Display initial message
  if (data.initialMessage) {
    displayMessage(data.initialMessage);
  }
  
  // Display all tasks
  data.tasks.forEach(task => {
    if (task.status === 'completed') {
      displayCompletedTask(task);
    } else {
      displayCurrentTask(task);
    }
  });
};
```

### Handling Task Submission
```javascript
const submitTask = async (taskData) => {
  const response = await fetch('/api/tasks/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(taskData)
  });
  
  const data = await response.json();
  
  // Show evaluation result
  showEvaluation({
    score: data.submission.score,
    feedback: data.submission.feedback,
    improvements: data.submission.improvements,
    canProceed: data.canProceed
  });
  
  // If can proceed, show next task
  if (data.canProceed && data.nextTask) {
    displayNextTask(data.nextTask);
    
    // Show new task message
    if (data.nextTaskMessage) {
      displayMessage(data.nextTaskMessage);
    }
  } else {
    // Show resubmit option
    showResubmitOption();
  }
};
```

### Handling Resubmission
```javascript
const resubmitTask = async (taskId, taskData) => {
  const response = await fetch(`/api/tasks/resubmit/${taskId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(taskData)
  });
  
  const data = await response.json();
  
  // Update task with new score (highest)
  if (data.submission.isResubmission) {
    updateTaskScore(taskId, data.submission.score);
  }
  
  // Same handling as submit task
  handleTaskResponse(data);
};
```

---

## Support & Questions

For questions or clarifications about these changes, please refer to:
- API Documentation: `API_DOCUMENTATION.md`
- Postman Collection: `KAIRO_API.postman_collection.json`
- Backend README: `README.md`

---

**Last Updated:** 2024-01-15
**Version:** 2.0.0

