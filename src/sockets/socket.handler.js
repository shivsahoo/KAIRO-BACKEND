import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import SimulationSession from '../models/SimulationSession.model.js';
import Message from '../models/Message.model.js';
import { generatePersonaResponse, streamPersonaResponse } from '../services/ai.orchestrator.js';
import { getCurrentTask, getNextTaskIndex } from '../services/task.service.js';

/**
 * Authenticate socket connection
 */
async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      // In development, allow connection without token but with demo user
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️  Development mode: Allowing connection without token');
        socket.userId = 'demo-user-' + Date.now();
        socket.user = { _id: socket.userId, email: 'demo@example.com', name: 'Demo User' };
        return next();
      }
      return next(new Error('Authentication error: No token provided'));
    }

    // Check if it's a demo token (base64 encoded JSON)
    try {
      const decodedDemo = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      if (decodedDemo.demo && decodedDemo.userId) {
        console.log('✅ Demo token detected, allowing connection');
        socket.userId = decodedDemo.userId;
        socket.user = { _id: decodedDemo.userId, email: 'demo@example.com', name: 'Demo User' };
        return next();
      }
    } catch (e) {
      // Not a demo token, continue with JWT verification
    }

    // Try JWT verification for real tokens
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (jwtError) {
      // If JWT verification fails and we're in development, allow demo connection
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️  JWT verification failed, but allowing demo connection in development');
        socket.userId = 'demo-user-' + Date.now();
        socket.user = { _id: socket.userId, email: 'demo@example.com', name: 'Demo User' };
        return next();
      }
      next(new Error('Authentication error: Invalid token'));
    }
  } catch (error) {
    // In development, allow connection even on error
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️  Auth error in development, allowing demo connection:', error.message);
      socket.userId = 'demo-user-' + Date.now();
      socket.user = { _id: socket.userId, email: 'demo@example.com', name: 'Demo User' };
      return next();
    }
    next(new Error('Authentication error: Invalid token'));
  }
}

import { processAudioBuffer } from '../services/mock-interview.service.js';

/**
 * Initialize Socket.io
 */
export function initializeSocket(io) {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.userId}`);
    
    // Audio Buffer for Streaming
    socket.audioBuffer = []; 

    // ... existing handlers ...

    // --- MOCK INTERVIEW STREAMING HANDLERS ---

    socket.on('mock_audio_start', ({ roomName }) => {
      console.log(`🎙️ [Socket] Audio stream started for ${roomName}`);
      socket.audioBuffer = []; // Reset buffer
    });

    socket.on('mock_audio_chunk', (chunk) => {
      if (chunk && socket.audioBuffer) {
        // Append chunk to buffer
        socket.audioBuffer.push(Buffer.from(chunk));
      }
    });

    socket.on('mock_audio_end', async ({ roomName }) => {
      console.log(`🛑 [Socket] Audio stream ended for ${roomName}, processing...`);
      
      if (!socket.audioBuffer || socket.audioBuffer.length === 0) {
        return;
      }

      try {
        // Combine chunks
        const fullBuffer = Buffer.concat(socket.audioBuffer);
        socket.audioBuffer = []; // Clear

        // Process via Service (Whisper -> GPT -> TTS)
        const result = await processAudioBuffer(roomName, fullBuffer);
        
        // Emit back response
        socket.emit('mock_audio_response', {
           transcript: result.transcript,
           response: result.response,
           audioId: result.audioId,
           audioUrl: `/api/mock-interview/interview/${roomName}/audio/${result.audioId}` // Helper URL
        });

      } catch (err) {
        console.error('❌ [Socket] Audio processing failed:', err);
        socket.emit('mock_audio_error', { message: 'Failed to process audio stream' });
      }
    });
    
    // ... existing handlers ...

    // Join user's simulation room
    socket.on('join_simulation', async (sessionId) => {
      try {
        // In development with demo users, allow joining without strict user verification
        if (process.env.NODE_ENV === 'development' && socket.userId?.startsWith('demo-user')) {
          console.log(`👤 Demo user ${socket.userId} joining session ${sessionId}`);
          socket.join(sessionId.toString());
          socket.currentSessionId = sessionId.toString();
          return;
        }

        // Verify user owns this session (for production/real users)
        const session = await SimulationSession.findOne({
          _id: sessionId,
          userId: socket.userId,
          status: 'active',
        });

        if (!session) {
          // In development, still allow joining even if session not found in DB
          if (process.env.NODE_ENV === 'development') {
            console.log(`⚠️  Session not found in DB, but allowing join in development mode`);
            socket.join(sessionId.toString());
            socket.currentSessionId = sessionId.toString();
            return;
          }
          socket.emit('error', { message: 'Simulation session not found' });
          return;
        }

        socket.join(sessionId.toString());
        socket.currentSessionId = sessionId.toString();
        console.log(`👤 User ${socket.userId} joined session ${sessionId}`);
      } catch (error) {
        console.error('Error joining simulation:', error);
        // In development, allow joining even on error
        if (process.env.NODE_ENV === 'development') {
          console.log('⚠️  Error in join, but allowing in development mode');
          socket.join(sessionId.toString());
          socket.currentSessionId = sessionId.toString();
          return;
        }
        socket.emit('error', { message: 'Failed to join simulation' });
      }
    });

    // Handle message sending
    socket.on('send_message', async (data) => {
      try {
        const { message, persona } = data;

        if (!socket.currentSessionId) {
          socket.emit('error', { message: 'Not in a simulation session' });
          return;
        }

        const sessionId = socket.currentSessionId;

        // Verify session and get it
        // For demo users, skip userId check since it's not a valid ObjectId
        let session;
        if (socket.userId?.startsWith('demo-user')) {
          // For demo users, just check if session exists by ID
          try {
            session = await SimulationSession.findById(sessionId);
          } catch (error) {
            // If session not found in DB, create a mock session for demo
            console.log('⚠️  Demo session not in DB, using mock session');
            session = {
              _id: sessionId,
              userId: socket.userId,
              role: 'HR Executive',
              status: 'active',
              currentTaskIndex: 0,
              timeline: [],
            };
          }
        } else {
          // For real users, verify ownership
          session = await SimulationSession.findOne({
            _id: sessionId,
            userId: socket.userId,
            status: 'active',
          });
        }

        if (!session) {
          // For demo users, create a mock session
          if (socket.userId?.startsWith('demo-user')) {
            console.log('⚠️  Creating mock session for demo user');
            session = {
              _id: sessionId,
              userId: socket.userId,
              role: 'HR Executive',
              status: 'active',
              currentTaskIndex: 0,
              timeline: [],
            };
          } else {
            socket.emit('error', { message: 'Session not found' });
            return;
          }
        }

        // Get conversation history BEFORE saving user message to check if this is first message
        // For demo users, handle DB errors gracefully
        let historyBeforeUserMessage = [];
        try {
          historyBeforeUserMessage = await Message.find({ simulationId })
            .sort({ createdAt: -1 })
            .limit(20)
            .reverse();
        } catch (error) {
          console.log('⚠️  Could not fetch message history, using empty array for demo');
          historyBeforeUserMessage = [];
        }

        // Check if this is first-time user's first message (need to generate task brief)
        // If there are no messages in history at all, this is a first-time user's first message
        // The welcome message is not saved to DB, so we check if history is empty
        const aiMessagesBefore = historyBeforeUserMessage.filter(msg => msg.sender === 'manager' || msg.persona === 'Manager');
        const userMessagesBefore = historyBeforeUserMessage.filter(msg => msg.sender === 'user');
        const isFirstUserMessage = userMessagesBefore.length === 0; // This will be the first user message
        const needsTaskBrief = isFirstUserMessage && historyBeforeUserMessage.length === 0; // No messages at all (welcome not saved to DB, no task brief yet)

        // Save user message (skip DB save for demo users if DB not available)
        let userMessage;
        try {
          userMessage = await Message.create({
            simulationId: sessionId,
            sender: 'user',
            persona: null,
            text: message,
          });
        } catch (error) {
          // For demo users, create mock message
          console.log('⚠️  Could not save user message to DB, using mock message');
          userMessage = {
            _id: `msg-${Date.now()}`,
            simulationId: sessionId,
            sender: 'user',
            persona: null,
            text: message,
            createdAt: new Date(),
          };
        }

        // Emit user message
        io.to(sessionId).emit('new_message', {
          id: userMessage._id,
          sender: 'user',
          persona: null,
          text: message,
          timestamp: userMessage.createdAt,
        });

        // Get conversation history (including the user message we just saved)
        // For demo users, handle DB errors gracefully
        let history = [];
        try {
          history = await Message.find({ simulationId })
            .sort({ createdAt: -1 })
            .limit(20)
            .reverse();
        } catch (error) {
          console.log('⚠️  Could not fetch message history, using empty array for demo');
          history = [];
        }

        // Get current task for context (session already retrieved above)
        const { getCurrentTask } = await import('../services/task.service.js');
        const currentTask = getCurrentTask(session?.currentTaskIndex || 0);

        // If this is first-time user's first message, generate task brief first
        if (needsTaskBrief && currentTask) {
          console.log('👋 First-time user detected - generating task brief...');
          
          const { generatePersonaResponse } = await import('../services/ai.orchestrator.js');
          const { generateHRScenarioPrompt } = await import('../controllers/simulation.controller.js');
          
          // Get user name for prompt
          let userName = 'there';
          try {
            const User = (await import('../models/User.model.js')).default;
            const user = await User.findById(session.userId);
            if (user && user.name) {
              userName = user.name;
            }
          } catch (error) {
            console.log('⚠️  Could not fetch user name, using default');
          }
          
          // Create a realistic HR scenario prompt based on the task
          let taskBriefContent = '';
          
          // For hr_t3, hardcode the message with actual candidate details to avoid AI hallucination
          if (currentTask && currentTask.id === 'hr_t3') {
            try {
              const { getSharedResumes } = await import('../services/resume.service.js');
              const resumes = await getSharedResumes();
              
              // Select a candidate for the interview
              const candidate = resumes
                .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
                .slice(0, 1)[0];
              
              // Generate meeting link
              const meetingLink = `https://meet.company.com/interview/${Date.now()}-${candidate._id.toString().slice(-6)}`;
              
              // Generate interview time (next week, weekday, 10 AM - 11 AM)
              const nextWeek = new Date();
              nextWeek.setDate(nextWeek.getDate() + 7);
              nextWeek.setHours(10, 0, 0, 0);
              
              // Ensure it's a weekday
              while (nextWeek.getDay() === 0 || nextWeek.getDay() === 6) {
                nextWeek.setDate(nextWeek.getDate() + 1);
              }
              
              const startTime = new Date(nextWeek);
              const endTime = new Date(nextWeek);
              endTime.setHours(11, 0, 0, 0);
              
              // Interviewer details
              const interviewerName = 'Sarah Chen';
              const interviewerEmail = 'sarah.chen@company.com';
              
              // Format dates/times in readable format
              const startTimeISO = startTime.toISOString();
              const endTimeISO = endTime.toISOString();
              const startTimeReadable = startTime.toLocaleString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit',
                timeZoneName: 'short'
              });
              const endTimeReadable = endTime.toLocaleString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                timeZoneName: 'short'
              });
              
              // Format dates/times in readable format for AI message
              const interviewDateTime = `${startTimeReadable} to ${endTimeReadable}`;
              
              // Replace placeholders with actual values (use readable formats for AI message)
              scenarioPrompt = scenarioPrompt
                .replace(/\[CANDIDATE_EMAIL\]/g, candidate.email)
                .replace(/\[CANDIDATE_NAME\]/g, candidate.candidateName)
                .replace(/\[START_TIME\]/g, interviewDateTime)
                .replace(/\[END_TIME\]/g, interviewDateTime)
                .replace(/\[INTERVIEWER_EMAIL\]/g, interviewerEmail)
                .replace(/\[INTERVIEWER_NAME\]/g, interviewerName);
              
              
              // Hardcode the message to avoid AI hallucination
              taskBriefContent = `Welcome to your next task! I need you to schedule an interview with the following details:

**Interview Details:**
- Candidate Email: ${candidate.email}
- Candidate Name: ${candidate.candidateName}
- Interview Date & Time: ${startTimeReadable} to ${endTimeReadable}
- Interview Type: video
- Interviewer Email: ${interviewerEmail}
- Interviewer Name: ${interviewerName}
- Title: Interview - Python Developer Position

**Task Instructions:**
1. Schedule the interview using the candidate email (${candidate.email}) and the time slot above
2. Send an email to the candidate (${candidate.email}) with the resume attached
3. Make sure to CC the interviewer (${interviewerEmail}) in the email

Please schedule this interview and send the email. Let me know once you've completed both tasks.`;
            } catch (error) {
              console.error('Error generating hr_t3 interview details:', error);
            }
          }
          
          // Generate task brief
          let taskBrief;
          if (taskBriefContent) {
            // Use hardcoded message for hr_t3
            taskBrief = taskBriefContent;
          } else {
            // Generate AI message for other tasks
            let scenarioPrompt = generateHRScenarioPrompt(currentTask, session?.role || 'HR Executive', userName);
            try {
              const aiResponse = await generatePersonaResponse(
                scenarioPrompt,
                'Manager',
                {
                  conversationHistory: [],
                  currentTask: currentTask,
                  simulationRole: session?.role,
                }
              );
              taskBrief = aiResponse.reply || `Great! Let me brief you on your first task: ${currentTask.title}. ${currentTask.description}. Let's get started!`;
            } catch (error) {
              console.error('Error generating task brief:', error);
              taskBrief = `Great! Let me brief you on your first task: ${currentTask.title}. ${currentTask.description}. Let's get started!`;
            }
          }

          // Save task brief message
          let taskBriefMessage;
          try {
            taskBriefMessage = await Message.create({
              simulationId: sessionId,
              sender: 'manager',
              persona: 'Manager',
              text: taskBrief,
            });
          } catch (error) {
            console.log('⚠️  Could not save task brief to DB, using mock message');
            taskBriefMessage = {
              _id: `msg-${Date.now()}`,
              simulationId: sessionId,
              sender: 'manager',
              persona: 'Manager',
              text: taskBrief,
              createdAt: new Date(),
            };
          }

          // Emit task brief first
          const taskBriefId = `temp-taskbrief-${Date.now()}`;
          io.to(sessionId).emit('message_start', {
            id: taskBriefId,
            sender: 'manager',
            persona: 'Manager',
          });

          // Stream task brief word by word for better UX
          const words = taskBrief.split(' ');
          for (let i = 0; i < words.length; i++) {
            const chunk = (i === 0 ? '' : ' ') + words[i];
            io.to(sessionId).emit('message_chunk', {
              id: taskBriefId,
              chunk: chunk,
            });
            // Small delay for readability
            await new Promise(resolve => setTimeout(resolve, 30));
          }

          io.to(sessionId).emit('message_complete', {
            id: taskBriefId,
          });

          // Save task brief message ID
          try {
            io.to(sessionId).emit('message_saved', {
              id: taskBriefMessage._id.toString(),
              timestamp: taskBriefMessage.createdAt,
            });
          } catch (error) {
            console.log('⚠️  Could not emit message_saved for task brief');
          }

          // Update history to include task brief for AI response context
          history.push(taskBriefMessage);
          // Re-sort history by creation time
          history.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        // Determine persona (default to Manager if not specified)
        const currentPersona = persona || 'Manager';

        // Emit typing indicator
        io.to(sessionId).emit('persona_typing', {
          persona: currentPersona,
          isTyping: true,
        });

        // Create a temporary message ID for streaming
        const tempMessageId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Emit message start event
        io.to(sessionId).emit('message_start', {
          id: tempMessageId,
          sender: currentPersona === 'Manager' ? 'manager' : 
                  currentPersona === 'Candidate' ? 'candidate' : 
                  currentPersona === 'Team' ? 'team' : 'system',
          persona: currentPersona,
        });

        // Stream AI response with full context including current task
        let fullResponse = '';
        let finalResponse = '';
        
        try {
          console.log('🔄 Starting OpenAI streaming for message:', message.substring(0, 50) + '...');
          const aiResponse = await streamPersonaResponse(
            message,
            currentPersona,
            { 
              conversationHistory: history,
              currentTask: currentTask,
              simulationRole: session?.role,
            },
            (chunk) => {
              // Emit each chunk as it arrives
              fullResponse += chunk;
              io.to(sessionId).emit('message_chunk', {
                id: tempMessageId,
                chunk: chunk,
              });
            }
          );

          // Use the streamed response if available, otherwise use the returned response
          finalResponse = fullResponse || aiResponse.reply;
          
          if (!fullResponse && !aiResponse.reply) {
            console.error('❌ No response from OpenAI streaming');
            throw new Error('No response from AI');
          }
          
          console.log('✅ OpenAI streaming completed. Response length:', finalResponse.length);
        } catch (error) {
          console.error('❌ Error in OpenAI streaming:', error);
          // Emit error to client
          io.to(sessionId).emit('error', { 
            message: 'Failed to get AI response. Please try again.',
            details: error.message 
          });
          
          // Emit typing indicator off
          io.to(sessionId).emit('persona_typing', {
            persona: currentPersona,
            isTyping: false,
          });
          
          // Emit message complete to stop loading
          io.to(sessionId).emit('message_complete', {
            id: tempMessageId,
          });
          
          return; // Exit early on error
        }

        // Emit typing indicator off
        io.to(sessionId).emit('persona_typing', {
          persona: currentPersona,
          isTyping: false,
        });

        // Emit message complete event
        io.to(sessionId).emit('message_complete', {
          id: tempMessageId,
        });

        // Save AI message to database (skip DB save for demo users if DB not available)
        let aiMessage;
        try {
          aiMessage = await Message.create({
            simulationId: sessionId,
            sender: currentPersona === 'Manager' ? 'manager' : 
                    currentPersona === 'Candidate' ? 'candidate' : 
                    currentPersona === 'Team' ? 'team' : 'system',
            persona: currentPersona,
            text: finalResponse,
          });
        } catch (error) {
          // For demo users, create mock message
          console.log('⚠️  Could not save AI message to DB, using mock message');
          aiMessage = {
            _id: `msg-${Date.now()}`,
            simulationId: sessionId,
            sender: currentPersona === 'Manager' ? 'manager' : 
                    currentPersona === 'Candidate' ? 'candidate' : 
                    currentPersona === 'Team' ? 'team' : 'system',
            persona: currentPersona,
            text: finalResponse,
            createdAt: new Date(),
          };
        }

        // Update timeline (only if session has save method)
        if (session.timeline) {
          session.timeline.push({
            type: 'message',
            timestamp: new Date(),
            meta: { messageId: aiMessage._id },
          });
        }
        
        // Only save to DB if session has save method (real DB session)
        if (session.save && typeof session.save === 'function') {
          try {
            await session.save();
          } catch (error) {
            console.log('⚠️  Could not save session timeline, continuing anyway');
          }
        }

        // Emit final message with database ID (for history sync)
        io.to(sessionId).emit('message_saved', {
          tempId: tempMessageId,
          id: aiMessage._id,
          timestamp: aiMessage.createdAt,
        });

        // Check for skip/exit commands in user message
        const skipCommands = ['skip', 'exit', 'end'];
        const messageLower = message.toLowerCase().trim();
        
        if (skipCommands.some(cmd => messageLower === cmd || messageLower.startsWith(cmd + ' '))) {
          // Generate summary and end session
          const summaryText = generateSessionSummary(session, history);
          const summaryMessage = await Message.create({
            simulationId: sessionId,
            sender: 'system',
            persona: null,
            text: summaryText,
          });

          io.to(sessionId).emit('new_message', {
            id: summaryMessage._id,
            sender: 'system',
            persona: null,
            text: summaryMessage.text,
            timestamp: summaryMessage.createdAt,
          });

          // End session
          session.status = 'ended';
          session.endedAt = new Date();
          session.timeline.push({
            type: 'session_ended',
            timestamp: new Date(),
            meta: { reason: 'user_skipped' },
          });
          await session.save();

          io.to(sessionId).emit('session_ended', {
            sessionId,
            summary: summaryMessage.text,
          });
        }
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle audio message
    socket.on('send_audio', async (data) => {
      try {
        const { audioUrl, persona } = data;

        if (!socket.currentSessionId) {
          socket.emit('error', { message: 'Not in a simulation session' });
          return;
        }

        // Save user audio message
        const userMessage = await Message.create({
          simulationId: socket.currentSessionId,
          sender: 'user',
          persona: null,
          text: '[Audio message]',
          audioUrl,
        });

        // Emit user message
        io.to(socket.currentSessionId).emit('new_message', {
          id: userMessage._id,
          sender: 'user',
          persona: null,
          text: '[Audio message]',
          audioUrl,
          timestamp: userMessage.createdAt,
        });

        // TODO: Process audio with STT, then generate response
        // For now, emit placeholder response
        const aiMessage = await Message.create({
          simulationId: socket.currentSessionId,
          sender: 'manager',
          persona: 'Manager',
          text: 'I received your audio message. Please use text for better communication.',
        });

        io.to(socket.currentSessionId).emit('new_message', {
          id: aiMessage._id,
          sender: 'manager',
          persona: 'Manager',
          text: aiMessage.text,
          timestamp: aiMessage.createdAt,
        });
      } catch (error) {
        console.error('Send audio error:', error);
        socket.emit('error', { message: 'Failed to send audio' });
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      if (socket.currentSessionId) {
        socket.to(socket.currentSessionId).emit('user_typing', {
          userId: socket.userId,
          isTyping: data.isTyping || false,
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${socket.userId}`);
    });
  });
}

/**
 * Generate session summary (for skip/exit commands)
 */
function generateSessionSummary(session, messages) {
  const taskCount = session.currentTaskIndex;
  const messageCount = messages.length;
  const userMessages = messages.filter(m => m.sender === 'user').length;
  
  return `Session Summary:
- Tasks attempted: ${taskCount}
- Total messages: ${messageCount} (${userMessages} from you)
- Session duration: ${Math.floor((Date.now() - session.startedAt) / 1000 / 60)} minutes

Thank you for participating! Your progress has been saved.`;
}

