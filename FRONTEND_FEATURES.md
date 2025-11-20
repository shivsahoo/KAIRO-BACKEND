# Frontend Features Documentation

This document describes all the features implemented in the KAIRO Frontend application and how they integrate with the backend.

## 📱 Frontend Architecture

**Tech Stack:**
- React 18 with TypeScript
- Vite (Build tool)
- Tailwind CSS (Styling)
- Framer Motion (Animations)
- Zustand (State Management)
- Socket.io Client (WebSocket)
- React Router DOM (Navigation)
- Lucide React (Icons)
- Shadcn/ui (UI Components)

---

## 🎨 Pages & Features

### 1. **Login Page** (`/login`)

**File:** `KAIRO-FRONTEND/src/pages/Login.tsx`

**Features:**
- ✅ Glass-morphism design with gradient background
- ✅ Email/Password login form
- ✅ Password visibility toggle (Eye/EyeOff icons)
- ✅ "Forgot Password?" link
- ✅ Social login buttons (Google, GitHub, Facebook)
- ✅ "Don't have an account? Register for free" link
- ✅ Animated floating decorative elements
- ✅ Kairo branding and logo display
- ✅ Stats display (500+ Career Paths, 50K+ Active Users)
- ✅ Responsive design

**Backend Integration:**
- Form submission (currently navigates to role selection)
- Should integrate with: `POST /api/auth/login`
- Social login buttons should integrate with: `POST /api/auth/google`

**UI Design:**
- Left side: Kairo branding, description, stats
- Right side: Glass-morphism login form
- Gradient background: Blue tones (`#6B8DD6` → `#8FA8E0` → `#B4C7EA`)
- White glassmorphic cards with backdrop blur

---

### 2. **Role Selection Page** (`/`)

**File:** `KAIRO-FRONTEND/src/pages/RoleSelection.tsx`

**Features:**
- ✅ Animated title sequence: "Career Growth?" → "Challenges?" → "Master It." → "Join Kairo!"
- ✅ Animated blurry bubble background (multiple sizes, floating animations)
- ✅ "Get Started" button
- ✅ Two role cards:
  - **HR Executive**: Handle employee relations, recruitment, workplace scenarios
  - **Business Analyst**: Analyze business processes, identify improvements, strategic decisions
- ✅ Role cards with icons (Users, TrendingUp from Lucide)
- ✅ Hover animations on role cards
- ✅ Framer Motion animations for entrance/exit
- ✅ Responsive grid layout

**Backend Integration:**
- Role selection triggers: `POST /api/simulation/start` with `role: "HR Executive"` or `"Business Analyst"`
- Stores selected role in Zustand store
- Navigates to `/simulation` page

**UI Design:**
- Full-screen centered layout
- Light background with animated bubble overlays
- Role cards: White background, rounded corners, hover effects
- Clean, modern design with smooth transitions

---

### 3. **Simulation Page** (`/simulation`) - **Main Feature**

**File:** `KAIRO-FRONTEND/src/pages/Simulation.tsx`

**Features:**
- ✅ **Fullscreen Figma-style UI** (fixed inset-0)
- ✅ **Top Header Bar:**
  - Kairo logo (gradient purple circle with "K")
  - Title: "Kairo Simulation"
  - Role display (e.g., "HR Executive")
  - "End Simulation" button (red)
  
- ✅ **Three-Panel Layout:**
  1. **Left Sidebar (Context Panel)** - 320px width
  2. **Center Panel (Chat Panel)** - Flexible width
  3. **Right Sidebar (Tasks Panel)** - 320px width

- ✅ **Loading State:**
  - Spinner animation during initialization
  - "Initializing simulation..." message

- ✅ **Initialization Flow:**
  1. Calls `POST /api/simulation/start` with role
  2. Stores session ID in localStorage
  3. Sets context (role, department, scenario, objectives)
  4. Adds initial AI message from Sarah (Manager)
  5. Adds tasks to sidebar
  6. Connects WebSocket for real-time chat

- ✅ **End Simulation:**
  - Calls evaluation API
  - Navigates to `/report` page
  - Resets simulation state

**Backend Integration:**
- `POST /api/simulation/start` - Starts simulation session
- WebSocket connection for real-time chat
- Stores session ID for WebSocket room joining

**UI Design:**
- Figma-inspired design system:
  - Colors: `#FAFAFA` (background), `#0D0D0D` (text), `#787878` (secondary), `#6366F1` (primary), `#E5E5E5` (borders)
  - Typography: 11px-15px font sizes
  - Spacing: 4px-8px padding/borders
  - Clean borders, rounded corners (8px radius)
  - Fullscreen layout with no scrolling on parent

---

### 4. **Context Panel** (Left Sidebar)

**File:** `KAIRO-FRONTEND/src/components/Simulation/ContextPanel.tsx`

**Features:**
- ✅ **Header:**
  - Title: "Context"
  - Subtitle: "Current simulation details"

- ✅ **Your Role Section:**
  - Role name display (e.g., "HR Executive")
  - Department display (e.g., "Human Resources")
  - Gray background box with border

- ✅ **Current Scenario Section:**
  - Scenario title (e.g., "Candidate Escalation")
  - Gray background box

- ✅ **Objectives Section:**
  - Bulleted list of objectives
  - Animated list items (Framer Motion)
  - Each objective in its own card

**Backend Integration:**
- Displays data from `context` object in simulation response
- Context structure:
  ```json
  {
    "role": "HR Executive",
    "department": "Human Resources",
    "currentScenario": "Task title",
    "objectives": ["Objective 1", "Objective 2", ...]
  }
  ```

**UI Design:**
- Clean white sidebar with section headers
- Uppercase labels with indigo color
- Gray boxes for content areas
- Scrollable content area

---

### 5. **Chat Panel** (Center) - **Core Feature**

**File:** `KAIRO-FRONTEND/src/components/Simulation/ChatPanel.tsx`

**Features:**
- ✅ **Header:**
  - Title: "Simulation Chat"
  - Subtitle: "Interact with your AI colleagues"

- ✅ **Message Display:**
  - User messages: Right-aligned, purple background (`#6366F1`), white text
  - AI messages: Left-aligned, white background, black text
  - System messages: Yellow background with border
  - Sender name display (e.g., "Sarah (Manager)")
  - Timestamp display (HH:MM format)
  - Smooth scroll to bottom on new messages
  - Framer Motion animations for message entrance

- ✅ **Typing Indicator:**
  - Animated dots when AI is typing
  - Purple dots bouncing animation
  - Shows "AI is typing" state

- ✅ **Message Input:**
  - Text input field
  - "Send" button (purple)
  - Enter key to send (Shift+Enter for new line)
  - Disabled state while loading
  - Placeholder: "Type your response..."

- ✅ **WebSocket Integration:**
  - Connects to backend WebSocket server
  - Authenticates with JWT token from localStorage
  - Joins simulation session room
  - Sends messages via `send_message` event
  - Receives messages via `new_message` event
  - Handles `persona_typing` events
  - Fallback to API if WebSocket not available

**Backend Integration:**
- **WebSocket Events:**
  - Client → Server: `send_message` (message, persona)
  - Server → Client: `new_message` (id, sender, text, timestamp)
  - Server → Client: `persona_typing` (persona, isTyping)
  - Client → Server: `join_simulation` (sessionId)
  - Client → Server: `typing` (isTyping)

- **Fallback API:**
  - `POST /api/simulation/message` (if WebSocket not connected)

**UI Design:**
- Center panel takes full available width
- Light gray background (`#FAFAFA`)
- Messages with rounded corners (8px)
- User messages: Purple (`#6366F1`)
- AI messages: White with border
- Clean input area at bottom with border separator

---

### 6. **Tasks Sidebar** (Right Sidebar)

**File:** `KAIRO-FRONTEND/src/components/Simulation/TasksSidebar.tsx`

**Features:**
- ✅ **Header:**
  - Title: "Tasks"
  - Subtitle: Shows task count (e.g., "4 active tasks")

- ✅ **Task Cards:**
  - Task icon (⏳ pending, 🔄 in-progress, ✅ completed)
  - Task title
  - Task description
  - Priority badge (high/medium/low) with color coding:
    - High: Red (`#DC2626`)
    - Medium: Yellow (`#D97706`)
    - Low: Green (`#059669`)
  - Status buttons: "pending", "in progress", "completed"
  - Active status highlighted in purple
  - Hover effects on task cards

- ✅ **Task Status Management:**
  - Users can change task status
  - Status updates stored in Zustand store
  - Framer Motion animations on status change

**Backend Integration:**
- Tasks received from `POST /api/simulation/start` response
- Task structure:
  ```json
  {
    "id": "hr_t1",
    "title": "Write a Job Description for an HR Intern",
    "description": "Draft a clear JD...",
    "status": "pending",
    "priority": "medium"
  }
  ```
- Task submission via: `POST /api/tasks/submit` (when implemented)

**UI Design:**
- Clean white sidebar
- Task cards with gray background
- Status buttons with active state highlighting
- Priority badges with appropriate colors
- Scrollable task list

---

### 7. **Performance Report Page** (`/report`)

**File:** `KAIRO-FRONTEND/src/pages/PerformanceReport.tsx`

**Features:**
- ✅ **Overall Score Display:**
  - Large score number (e.g., "85/100")
  - Color-coded by score:
    - Green (≥80)
    - Yellow (60-79)
    - Red (<60)
  - Animated score display (scale animation)
  - Progress bar with gradient fill
  - Animated progress bar fill

- ✅ **Feedback Section:**
  - Overall feedback text
  - Glass-morphism card design

- ✅ **Strengths Section:**
  - List of strengths
  - Green checkmarks (✓)
  - Animated list items

- ✅ **Areas for Improvement Section:**
  - List of improvements
  - Yellow arrows (→)
  - Animated list items

- ✅ **Skills Assessment:**
  - Skills breakdown with levels (1-10)
  - Progress bars for each skill
  - Animated progress bars
  - Skill names and scores

- ✅ **Actions:**
  - "Start New Simulation" button
  - Resets store and navigates to role selection

**Backend Integration:**
- Evaluation data structure:
  ```json
  {
    "score": 85,
    "feedback": "Detailed feedback...",
    "strengths": ["Strength 1", ...],
    "improvements": ["Improvement 1", ...],
    "skills": [
      { "name": "Communication", "level": 8 },
      ...
    ]
  }
  ```
- Should integrate with: `GET /api/simulation/:id/final-report` for PDF download

**UI Design:**
- Centered layout with max-width
- Glass-morphism cards
- Color-coded sections
- Smooth animations
- Professional report aesthetic

---

## 🔄 State Management

**File:** `KAIRO-FRONTEND/src/store/simulationStore.ts`

**State Structure:**
```typescript
{
  role: 'HR Executive' | 'Business Analyst' | null,
  messages: Message[],
  tasks: Task[],
  context: ContextInfo | null,
  evaluation: Evaluation | null,
  isActive: boolean
}
```

**Actions:**
- `setRole(role)` - Set selected role
- `addMessage(message)` - Add message to chat
- `addTask(task)` - Add task to list
- `updateTask(taskId, updates)` - Update task status
- `setContext(context)` - Set simulation context
- `setEvaluation(evaluation)` - Set performance evaluation
- `startSimulation()` - Mark simulation as active
- `endSimulation()` - Mark simulation as ended
- `reset()` - Reset all state

---

## 🔌 API Integration

**File:** `KAIRO-FRONTEND/src/utils/api.ts`

**API Functions:**

1. **`startSimulation(role)`**
   - POST `/api/simulation/start`
   - Returns: `{ sessionId, context, initialMessage, tasks }`

2. **`sendMessage(message, history)`**
   - POST `/api/simulation/message`
   - Returns: `Message`

3. **`evaluatePerformance(messages, tasks)`**
   - POST `/api/simulation/evaluate`
   - Returns: `Evaluation`

**WebSocket Integration:**
- Base URL: `VITE_WS_URL` (default: `http://localhost:3000`)
- Connection with JWT authentication
- Session room joining
- Real-time message exchange

---

## 🎨 Design System

**Color Palette:**
- Primary: `#6366F1` (Indigo)
- Background: `#FAFAFA` (Light Gray)
- Text Primary: `#0D0D0D` (Almost Black)
- Text Secondary: `#787878` (Gray)
- Borders: `#E5E5E5` (Light Gray)
- Success: `#059669` (Green)
- Warning: `#D97706` (Yellow)
- Error: `#DC2626` (Red)

**Typography:**
- Font sizes: 11px, 12px, 13px, 14px, 15px
- Font weights: 400 (normal), 500 (medium), 600 (semibold)
- Font family: Inter, system-ui, sans-serif

**Spacing:**
- Padding: 4px, 6px, 8px, 12px, 16px, 24px
- Borders: 1px solid `#E5E5E5`
- Border radius: 6px, 8px

**Animations:**
- Framer Motion for page transitions
- Smooth scroll animations
- Hover effects (scale, color changes)
- Loading spinners
- Typing indicators

---

## 📡 WebSocket Communication Flow

### Connection Setup
1. Frontend gets session ID from `POST /api/simulation/start`
2. Stores session ID in `localStorage`
3. Connects to WebSocket with JWT token
4. Emits `join_simulation` with session ID

### Message Flow
1. User types message and clicks "Send"
2. Frontend emits `send_message` event:
   ```javascript
   {
     message: "User's message text",
     persona: "Manager"
   }
   ```
3. Backend receives message, processes with AI
4. Backend emits `new_message` event:
   ```javascript
   {
     id: "message-id",
     sender: "manager",
     persona: "Manager",
     text: "AI response",
     timestamp: Date
   }
   ```
5. Frontend displays message in chat

### Skip/Exit Commands
- User types "skip", "exit", or "end"
- Backend detects command
- Generates session summary
- Emits `session_ended` event
- Frontend can handle end session

---

## 🎯 Key Frontend Features Summary

### ✅ Implemented Features

1. **Authentication UI** (Login page with social buttons)
2. **Role Selection** (Animated landing page with role cards)
3. **Fullscreen Simulation UI** (Figma-style three-panel layout)
4. **Real-time Chat** (WebSocket integration with AI personas)
5. **Task Management** (Sidebar with status updates)
6. **Context Display** (Role, scenario, objectives)
7. **Performance Report** (Evaluation display with scores and feedback)
8. **State Management** (Zustand store for simulation state)
9. **Animations** (Framer Motion throughout)
10. **Responsive Design** (Mobile-friendly layouts)

### 🔄 Backend Requirements for Frontend

**Required Endpoints:**
- ✅ `POST /api/simulation/start` - Start simulation
- ✅ WebSocket server for real-time chat
- ⚠️ `POST /api/auth/login` - Login (UI ready, needs integration)
- ⚠️ `POST /api/auth/signup` - Signup (UI ready, needs integration)
- ⚠️ `GET /api/simulation/:id/final-report` - PDF download (endpoint exists, UI needs download button)

**Required WebSocket Events:**
- ✅ `join_simulation` - Join session room
- ✅ `send_message` - Send chat message
- ✅ `new_message` - Receive new message
- ✅ `persona_typing` - Typing indicator
- ✅ `task_assigned` - New task notification
- ✅ `task_scored` - Task evaluation notification

---

## 🧭 Routing & Navigation

**File:** `KAIRO-FRONTEND/src/App.tsx`

**Routes:**
- `/login` - Login page
- `/` - Role Selection page (home)
- `/simulation` - Simulation page (main feature)
- `/report` - Performance Report page

**Navigation Flow:**
- Login page → Role Selection (home)
- Role Selection → Simulation (when role selected)
- Simulation → Report (when "End Simulation" clicked)
- Report → Role Selection (when "Start New Simulation" clicked)

**Navbar:**
- Visible on all pages except Login and Simulation
- Logo on left (links to home)
- User icon on right (dropdown with logout)
- Glass-morphism design

---

## 🚀 User Flow

1. **User visits app** → Login page (`/login`)
2. **User logs in** → Role Selection page (`/`)
3. **User clicks "Get Started"** → Animated title sequence
4. **User selects role** (e.g., "HR Executive") → Simulation starts (`/simulation`)
5. **Backend creates session** → Returns initial message from Sarah (AI)
6. **Frontend displays simulation** → Three-panel layout (fullscreen)
7. **User chats with AI** → Real-time WebSocket communication
8. **User completes tasks** → Task status updates (pending → in-progress → completed)
9. **User clicks "End Simulation"** → Performance Report page (`/report`)
10. **User views evaluation** → Scores, feedback, strengths, improvements
11. **User clicks "Start New Simulation"** → Returns to Role Selection

---

## 📝 Notes for Backend Developers

1. **Session ID**: Frontend stores session ID in localStorage for WebSocket connection
2. **Authentication**: Frontend expects JWT token in localStorage (key: `authToken`)
3. **WebSocket**: Frontend connects automatically when session ID is available
4. **Message Format**: Frontend expects messages with `id`, `type`, `content`, `timestamp`, `sender`
5. **Task Format**: Frontend expects tasks with `id`, `title`, `description`, `status`, `priority`
6. **Error Handling**: Frontend shows alerts for API failures
7. **Fallback**: Frontend falls back to mock data if backend unavailable (for development)
8. **Skip/Exit Commands**: Frontend can send "skip", "exit", or "end" messages - backend should handle gracefully

---

## 🔗 Integration Points

| Frontend Feature | Backend Endpoint/Event | Status |
|-----------------|------------------------|--------|
| Role Selection | `POST /api/simulation/start` | ✅ Working |
| Chat Messages | WebSocket: `send_message` / `new_message` | ✅ Working |
| Task Display | Included in simulation start response | ✅ Working |
| Task Status | `POST /api/tasks/submit` | ⚠️ UI ready, needs integration |
| Performance Report | Evaluation data from store | ✅ Working |
| Login | `POST /api/auth/login` | ⚠️ UI ready, needs integration |
| Signup | `POST /api/auth/signup` | ⚠️ UI ready, needs integration |
| PDF Download | `GET /api/simulation/:id/final-report` | ⚠️ Endpoint exists, UI needs button |
| Skip/Exit Commands | WebSocket: detected in message text | ✅ Working |

---

## 🎯 Frontend-Backend Data Flow

### Starting Simulation
```
Frontend: POST /api/simulation/start { role: "HR Executive" }
↓
Backend: Creates session, generates AI welcome message
↓
Backend: Returns {
  sessionId: "...",
  context: { role, department, scenario, objectives },
  initialMessage: { id, type, content, timestamp, sender },
  tasks: [{ id, title, description, status, priority }]
}
↓
Frontend: Stores sessionId, displays UI, connects WebSocket
```

### Chat Message Flow
```
User types message → Frontend emits 'send_message' via WebSocket
↓
Backend: Receives message, generates AI response using OpenAI
↓
Backend: Saves to DB (if connected), emits 'new_message'
↓
Frontend: Displays AI response in chat
```

### Task Submission Flow
```
User updates task status → Frontend updates local state
↓
(When submitting) Frontend: POST /api/tasks/submit
↓
Backend: Evaluates task, generates feedback
↓
Backend: Emits 'task_scored' event, assigns next task
↓
Frontend: Updates task status, shows next task
```

---

---

## 📋 Detailed Component Breakdown

### **Context Panel Component**
**File:** `src/components/Simulation/ContextPanel.tsx`

**Props:** None (uses Zustand store)

**State:** Reads from `useSimulationStore`

**Features:**
- Displays user role (HR Executive / Business Analyst)
- Shows department (Human Resources / Business Analysis)
- Current scenario title
- List of objectives with bullet points
- Animated list items on mount
- Scrollable content area
- Section headers with uppercase labels
- Empty state: "No context available"

**Backend Data Required:**
```typescript
context: {
  role: string,
  department: string,
  currentScenario: string,
  objectives: string[]
}
```

---

### **Chat Panel Component**
**File:** `src/components/Simulation/ChatPanel.tsx`

**Props:** None (uses Zustand store)

**State:**
- `messages`: Message[] (from store)
- `input`: string (local state)
- `isLoading`: boolean (local state)
- `socket`: Socket | null (WebSocket connection)
- `sessionId`: string | null (from localStorage)

**Features:**
- Real-time message display with WebSocket
- Message input with Send button
- Enter key to send (Shift+Enter for new line)
- Typing indicators (animated dots)
- Auto-scroll to bottom on new messages
- Message bubbles with different styles:
  - User: Purple background (`#6366F1`), white text, right-aligned
  - AI: White background, black text, left-aligned
  - System: Yellow background, brown text
- Timestamp display (HH:MM format)
- Sender name display (e.g., "Sarah (Manager)")
- Loading state while waiting for AI response
- Fallback to mock API if WebSocket unavailable

**WebSocket Events:**
- Emits: `send_message`, `join_simulation`, `typing`
- Listens: `new_message`, `persona_typing`, `error`, `disconnect`

---

### **Tasks Sidebar Component**
**File:** `src/components/Simulation/TasksSidebar.tsx`

**Props:** None (uses Zustand store)

**State:**
- `tasks`: Task[] (from store)
- Task status updates (local via `updateTask`)

**Features:**
- Task list display with icons:
  - ⏳ Pending
  - 🔄 In-progress
  - ✅ Completed
- Task card information:
  - Title
  - Description
  - Priority badge (high/medium/low with colors)
- Status buttons:
  - "pending", "in progress", "completed"
  - Active status highlighted in purple
  - Click to change status
- Hover effects on task cards
- Framer Motion animations
- Empty state message ("No tasks assigned yet")
- Scrollable task list

**Backend Data Required:**
```typescript
tasks: [{
  id: string,
  title: string,
  description: string,
  status: 'pending' | 'in-progress' | 'completed',
  priority: 'low' | 'medium' | 'high'
}]
```

---

## 💡 Implementation Recommendations

1. **Add download button** to Performance Report page for PDF
2. **Integrate auth APIs** with Login page
3. **Add task submission API** integration when user completes task
4. **Handle WebSocket reconnection** if connection drops
5. **Add loading states** for task submissions
6. **Add error boundaries** for better error handling
7. **Add session persistence** - save progress on page reload
8. **Add message history** - Load previous messages when reconnecting
9. **Add file upload** - Support document uploads in chat
10. **Add voice input** - Speech-to-text integration for messages

---

This documentation should help backend developers understand what features the frontend expects and how they integrate with the backend API and WebSocket events.

