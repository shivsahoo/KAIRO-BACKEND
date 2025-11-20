import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import SimulationSession from '../models/SimulationSession.model.js';
import Message from '../models/Message.model.js';
import { generatePersonaResponse } from '../services/ai.orchestrator.js';
import { getCurrentTask, getNextTaskIndex } from '../services/task.service.js';

/**
 * Authenticate socket connection
 */
async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
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
        // Verify user owns this session
        const session = await SimulationSession.findOne({
          _id: sessionId,
          userId: socket.userId,
          status: 'active',
        });

        if (!session) {
          socket.emit('error', { message: 'Simulation session not found' });
          return;
        }

        socket.join(sessionId.toString());
        socket.currentSessionId = sessionId.toString();
        console.log(`👤 User ${socket.userId} joined session ${sessionId}`);
      } catch (error) {
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
        const session = await SimulationSession.findOne({
          _id: sessionId,
          userId: socket.userId,
          status: 'active',
        });

        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        // Save user message
        const userMessage = await Message.create({
          simulationId: sessionId,
          sender: 'user',
          persona: null,
          text: message,
        });

        // Emit user message
        io.to(sessionId).emit('new_message', {
          id: userMessage._id,
          sender: 'user',
          persona: null,
          text: message,
          timestamp: userMessage.createdAt,
        });

        // Get conversation history
        const history = await Message.find({ simulationId })
          .sort({ createdAt: -1 })
          .limit(20)
          .reverse();

        // Get current task for context (session already retrieved above)
        const { getCurrentTask } = await import('../services/task.service.js');
        const currentTask = getCurrentTask(session?.currentTaskIndex || 0);

        // Determine persona (default to Manager if not specified)
        const currentPersona = persona || 'Manager';

        // Emit typing indicator
        socket.to(sessionId).emit('persona_typing', {
          persona: currentPersona,
          isTyping: true,
        });

        // Generate AI response with full context including current task
        const aiResponse = await generatePersonaResponse(
          message,
          currentPersona,
          { 
            conversationHistory: history,
            currentTask: currentTask,
            simulationRole: session?.role,
          }
        );

        // Save AI message
        const aiMessage = await Message.create({
          simulationId: sessionId,
          sender: currentPersona === 'Manager' ? 'manager' : 
                  currentPersona === 'Candidate' ? 'candidate' : 
                  currentPersona === 'Team' ? 'team' : 'system',
          persona: currentPersona,
          text: aiResponse.reply,
        });

        // Update timeline
        session.timeline.push({
          type: 'message',
          timestamp: new Date(),
          meta: { messageId: aiMessage._id },
        });
        await session.save();

        // Emit typing indicator off
        socket.to(sessionId).emit('persona_typing', {
          persona: currentPersona,
          isTyping: false,
        });

        // Emit AI message
        io.to(sessionId).emit('new_message', {
          id: aiMessage._id,
          sender: currentPersona === 'Manager' ? 'manager' : 
                  currentPersona === 'Candidate' ? 'candidate' : 
                  currentPersona === 'Team' ? 'team' : 'system',
          persona: currentPersona,
          text: aiResponse.reply,
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

