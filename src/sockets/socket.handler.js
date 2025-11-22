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

        // Verify session and get it - REFRESH to get latest task index
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
          // For real users, verify ownership - REFRESH to get latest task index
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
        
        // IMPORTANT: Refresh session to get latest currentTaskIndex (in case task was just completed)
        if (session && session._id) {
          try {
            const refreshedSession = await SimulationSession.findById(session._id);
            if (refreshedSession) {
              session.currentTaskIndex = refreshedSession.currentTaskIndex;
              console.log('🔄 Refreshed session - currentTaskIndex:', session.currentTaskIndex);
            }
          } catch (error) {
            console.log('⚠️  Could not refresh session, using cached task index');
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

        // Get current task first
        const { getCurrentTask } = await import('../services/task.service.js');
        const currentTask = getCurrentTask(session?.currentTaskIndex || 0);
        
        // Check if task brief is needed for current task
        // Task brief needed when:
        // 1. First user message after welcome (for first task)
        // 2. User acknowledges and we're on a task that hasn't been introduced yet
        const userMessagesBefore = historyBeforeUserMessage.filter(msg => msg.sender === 'user');
        const isFirstUserMessage = userMessagesBefore.length === 0;
        const isFirstTask = (session?.currentTaskIndex === 0 || session?.currentTaskIndex === undefined || session?.currentTaskIndex === null);
        
        // Check if task brief already exists for current task
        const aiMessagesBefore = historyBeforeUserMessage.filter(msg => msg.sender === 'manager' || msg.persona === 'Manager');
        const hasTaskBrief = currentTask && aiMessagesBefore.some(msg => {
          if (!msg.text) return false;
          const text = msg.text.toLowerCase();
          const taskTitleWords = currentTask.title.toLowerCase().split(' ');
          return (
            (text.includes('continue with') && (text.includes('task') || text.includes('next'))) ||
            (text.includes('next task') && text.includes(taskTitleWords[0])) ||
            (text.includes('task') && text.includes(taskTitleWords[0]) && (text.includes('continue') || text.includes('next')))
          );
        });
        
        // Check if user is acknowledging (for all tasks) - be more lenient
        const userMessageLower = message.toLowerCase();
        const isAcknowledgment = userMessageLower.includes('thank') || 
                                 userMessageLower.includes('thanks') ||
                                 userMessageLower.includes('done') ||
                                 userMessageLower.includes('complete') ||
                                 userMessageLower.includes('finished') ||
                                 userMessageLower.includes('submitted') ||
                                 userMessageLower.includes('ready');
        
        // Check if we recently completed a task (look for task completion messages or submissions)
        const recentTaskCompletion = aiMessagesBefore.some(msg => 
          msg.text && (
            msg.text.toLowerCase().includes('great work') ||
            msg.text.toLowerCase().includes('well done') ||
            msg.text.toLowerCase().includes('task completed') ||
            msg.text.toLowerCase().includes('submission received') ||
            msg.text.toLowerCase().includes('score') ||
            msg.text.toLowerCase().includes('feedback')
          )
        );
        
        // Check if there are task submissions for previous tasks (indicates task was completed)
        let hasPreviousTaskSubmission = false;
        let previousTaskTitle = null;
        if (session?.currentTaskIndex > 0 && session?._id) {
          try {
            const TaskSubmission = (await import('../models/TaskSubmission.model.js')).default;
            const previousTaskIndex = session.currentTaskIndex - 1;
            const previousTask = getCurrentTask(previousTaskIndex);
            if (previousTask) {
              const submissions = await TaskSubmission.find({
                simulationId: session._id,
                taskId: previousTask.id,
              }).limit(1);
              hasPreviousTaskSubmission = submissions.length > 0;
              previousTaskTitle = previousTask.title;
            }
          } catch (error) {
            console.log('⚠️  Could not check task submissions');
          }
        }
        
        // Also check if current task index > 0 and we haven't introduced this task yet
        // This catches the case where task was just completed and we moved to next task
        const isNewTaskWithoutBrief = !isFirstTask && currentTask && !hasTaskBrief;
        
        // Task brief needed if:
        // 1. First user message on first task (after welcome) AND no task brief yet
        // 2. OR we're on a new task (not first) AND no task brief yet AND (user acknowledges OR previous task has submission)
        // This ensures we generate brief for task 2, 3, 4 when user sends any message after completing previous task
        const needsTaskBrief = currentTask && !hasTaskBrief && (
          (isFirstUserMessage && isFirstTask) ||
          (isNewTaskWithoutBrief && (isAcknowledgment || hasPreviousTaskSubmission || userMessagesBefore.length > 0))
        );
        
        console.log('🔍 Task brief check (dynamic for all tasks):', {
          isFirstUserMessage,
          isFirstTask,
          isAcknowledgment,
          isNewTaskWithoutBrief,
          currentTaskIndex: session?.currentTaskIndex,
          currentTaskId: currentTask?.id,
          currentTaskTitle: currentTask?.title,
          hasCurrentTask: !!currentTask,
          hasTaskBrief,
          recentTaskCompletion,
          hasPreviousTaskSubmission,
          previousTaskTitle,
          needsTaskBrief,
          messagePreview: message.substring(0, 30)
        });

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

        // Current task already retrieved above, use it here

        // Flag to track if we sent task brief (to prevent additional AI response)
        let taskBriefSent = false;

        // If task brief is needed, generate it dynamically with AI (but concise and direct)
        if (needsTaskBrief && currentTask) {
          console.log('🚨🚨🚨 ENTERING TASK BRIEF BLOCK - GENERATING CONCISE AI TASK BRIEF 🚨🚨🚨');
          console.log('👋 Task brief needed - generating concise AI task brief...');
          console.log('📋 Task details:', {
            title: currentTask.title,
            description: currentTask.description,
            expectedOutput: currentTask.expectedOutput,
            taskIndex: session?.currentTaskIndex || 0
          });
          
          // Generate concise, direct task brief using AI with strict system prompt
          const { aiClient, provider } = await import('../config/ai.config.js');
          
          // Get user name for personalization
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
          
          // Create concise task brief prompt - direct assignment, no questions
          const taskNumber = (session?.currentTaskIndex || 0) + 1;
          const taskTitle = currentTask.title;
          const taskDescription = currentTask.description;
          const taskOutput = currentTask.expectedOutput;
          
          // Different prompt for first task vs subsequent tasks - be very explicit
          let taskBriefPrompt;
          if (isFirstTask) {
            taskBriefPrompt = `${userName} just thanked you after the welcome message. 

You need to assign them their first task. 

TASK DETAILS:
- Task Title: "${taskTitle}"
- Task Description: "${taskDescription}"
- Expected Output: "${taskOutput}"

Respond with exactly this format (2-3 sentences):
1. "Thank you!"
2. "Please continue with your first task: ${taskTitle}."
3. "${taskDescription} The expected output is: ${taskOutput}."

DO NOT ask any questions. Just assign the task directly.`;
          } else {
            // For subsequent tasks, acknowledge previous task completion
            const { getTaskByIndex } = await import('../services/task.service.js');
            const previousTaskIndex = (session?.currentTaskIndex || 1) - 1;
            const previousTask = getTaskByIndex(previousTaskIndex);
            const prevTaskTitle = previousTask?.title || previousTaskTitle || 'the previous task';
            
            taskBriefPrompt = `${userName} just sent a message: "${message}". They just completed: "${prevTaskTitle}".

You need to:
1. Acknowledge their completion (be brief, 1 sentence): "Nice! You completed ${prevTaskTitle}." or "Great work on completing ${prevTaskTitle}!"
2. Assign them their next task (Task ${taskNumber}): "Please continue with your next task: ${taskTitle}."
3. Explain what's needed: "${taskDescription} The expected output is: ${taskOutput}."

Your response must be exactly 2-3 sentences total. Format:
"[Acknowledge completion]. [Assign next task]. [Explain what's needed]."

DO NOT ask any questions. DO NOT ask "how do you", "what do you", "have you considered", or any questions. Just acknowledge and assign directly.`;
          }
          
          // STRICT system prompt that prevents questions
          const strictSystemPrompt = `You are Sarah Chen, HR Manager. Your ONLY job right now is to assign a task directly.

ABSOLUTE RULES - NO EXCEPTIONS:
1. You MUST respond in exactly 2-3 sentences
2. You MUST directly assign the task - NO QUESTIONS
3. You MUST follow the exact format provided in the user's message
4. You MUST NOT ask "how do you envision", "what do you think", "have you considered", "what specific", or ANY questions
5. You MUST NOT ask about their approach, thoughts, or considerations
6. You MUST acknowledge, assign task, and explain expected output
7. NO QUESTION MARKS (?) ALLOWED IN YOUR RESPONSE

Your response should be: Acknowledge → Assign task → Explain what's needed. That's it. NO QUESTIONS.`;
          
          console.log('✅ Generating AI task brief with STRICT system prompt (no questions)...');
          let taskBrief;
          try {
            if (aiClient && provider === 'openai') {
              const response = await aiClient.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                  { role: 'system', content: strictSystemPrompt },
                  { role: 'user', content: taskBriefPrompt }
                ],
                temperature: 0.3, // Lower temperature for more direct responses
                max_tokens: 150, // Limit to keep it concise
                presence_penalty: 0, // No penalty to avoid questions
                frequency_penalty: 0,
              });
              taskBrief = response.choices[0].message.content.trim();
              
              // Post-process to ensure no questions - comprehensive check
              const lowerBrief = taskBrief.toLowerCase();
              const hasQuestion = taskBrief.includes('?') || 
                                 lowerBrief.includes('how do you') || 
                                 lowerBrief.includes('what do you') || 
                                 lowerBrief.includes('have you considered') ||
                                 lowerBrief.includes('what specific') ||
                                 lowerBrief.includes('how would you') ||
                                 lowerBrief.includes('what are your') ||
                                 lowerBrief.includes('can you tell me');
              
              if (hasQuestion) {
                console.log('⚠️ AI generated a question, using fallback. Generated:', taskBrief);
                taskBrief = `Thank you! Please continue with your ${isFirstTask ? 'first' : 'next'} task: ${taskTitle}. ${taskDescription}. The expected output is: ${taskOutput}.`;
              }
            } else if (aiClient && provider === 'anthropic') {
              const response = await aiClient.messages.create({
                model: 'claude-3-opus-20240229',
                max_tokens: 150,
                system: strictSystemPrompt,
                messages: [
                  { role: 'user', content: taskBriefPrompt }
                ],
              });
              taskBrief = response.content[0].text.trim();
              
              // Post-process to ensure no questions - comprehensive check
              const lowerBrief = taskBrief.toLowerCase();
              const hasQuestion = taskBrief.includes('?') || 
                                 lowerBrief.includes('how do you') || 
                                 lowerBrief.includes('what do you') || 
                                 lowerBrief.includes('have you considered') ||
                                 lowerBrief.includes('what specific') ||
                                 lowerBrief.includes('how would you') ||
                                 lowerBrief.includes('what are your') ||
                                 lowerBrief.includes('can you tell me');
              
              if (hasQuestion) {
                console.log('⚠️ AI generated a question, using fallback. Generated:', taskBrief);
                taskBrief = `Thank you! Please continue with your ${isFirstTask ? 'first' : 'next'} task: ${taskTitle}. ${taskDescription}. The expected output is: ${taskOutput}.`;
              }
            } else {
              // Fallback if no AI client
              taskBrief = `Thank you! Please continue with your ${isFirstTask ? 'first' : 'next'} task: ${taskTitle}. ${taskDescription}. The expected output is: ${taskOutput}.`;
            }
          } catch (error) {
            console.error('Error generating task brief:', error);
            // Fallback to direct message
            taskBrief = `Thank you! Please continue with your ${isFirstTask ? 'first' : 'next'} task: ${taskTitle}. ${taskDescription}. The expected output is: ${taskOutput}.`;
          }
          
          console.log('✅ Generated AI task brief:', taskBrief);
          taskBriefSent = true;

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
          
          // If we just sent the task brief, that's the response to "thank you" - don't generate additional AI response
          // The task brief already explains the first task, so we can return here
          console.log('✅ Task brief sent - this is the response to user\'s first message');
          
          // Emit typing indicator off
          io.to(sessionId).emit('persona_typing', {
            persona: 'Manager',
            isTyping: false,
          });
          
          // Exit early - task brief is the complete response
          console.log('🚨🚨🚨 RETURNING EARLY - NO AI RESPONSE WILL BE GENERATED 🚨🚨🚨');
          console.log('✅ Task brief sent successfully, exiting early to prevent AI response');
          return; // CRITICAL: This return prevents any AI response generation
        } else {
          console.log('⚠️ Task brief NOT needed. Reasons:', {
            needsTaskBrief,
            hasCurrentTask: !!currentTask,
            isFirstUserMessage,
            currentTaskIndex: session?.currentTaskIndex,
            hasTaskBrief
          });
        }

        // CRITICAL SAFETY CHECK: if task brief was sent, don't generate AI response
        if (taskBriefSent) {
          console.log('🛑🛑🛑 SAFETY CHECK: Task brief was sent, preventing additional AI response 🛑🛑🛑');
          console.log('🛑 EXITING COMPLETELY - NO AI RESPONSE');
          return;
        }

        // Double check: if we're on first task and first user message, we should have sent task brief
        // If we reach here, something went wrong with the detection
        if (isFirstUserMessage && isFirstTask && currentTask && !hasTaskBrief) {
          console.log('🚨🚨🚨 ERROR: Should have sent task brief but didn\'t! Preventing AI response to avoid duplicate.');
          console.log('🚨 EXITING - Task brief should have been sent');
          return;
        }

        // FINAL CHECK: If we sent task brief in this request, absolutely do not generate AI response
        // This is a redundant check to be absolutely sure
        const recentTaskBrief = history.some(msg => 
          msg.sender === 'manager' && 
          msg.text && 
          msg.text.includes('continue with your first task')
        );
        if (recentTaskBrief && isFirstUserMessage) {
          console.log('🛑🛑🛑 FINAL CHECK: Found task brief in history, preventing AI response 🛑🛑🛑');
          return;
        }

        // Determine persona (default to Manager if not specified)
        const currentPersona = persona || 'Manager';
        
        // ABSOLUTE FINAL CHECK before generating AI response
        if (taskBriefSent || (isFirstUserMessage && isFirstTask && currentTask)) {
          console.log('🛑🛑🛑 ABSOLUTE FINAL CHECK FAILED - NOT GENERATING AI RESPONSE 🛑🛑🛑');
          console.log('🛑 taskBriefSent:', taskBriefSent, 'isFirstUserMessage:', isFirstUserMessage, 'isFirstTask:', isFirstTask);
          return;
        }
        
        console.log('⚠️⚠️⚠️ CONTINUING TO AI RESPONSE GENERATION (task brief was NOT sent) ⚠️⚠️⚠️');

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

