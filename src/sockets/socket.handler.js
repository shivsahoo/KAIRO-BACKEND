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

/**
 * Initialize Socket.io
 */
export function initializeSocket(io) {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.userId}`);

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

        // Get conversation history
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

