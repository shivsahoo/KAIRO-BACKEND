import SimulationSession from '../models/SimulationSession.model.js';
import Message from '../models/Message.model.js';
import { getCurrentTask, getTaskByIndex } from '../services/task.service.js';
import { generatePersonaResponse } from '../services/ai.orchestrator.js';
import { generatePDFReport } from '../services/pdf.service.js';

/**
 * Generate realistic HR scenario prompt based on task
 */
function generateHRScenarioPrompt(task, role, userName) {
  const scenarios = {
    'hr_t1': `You are Sarah Chen, HR Manager. ${userName} has just joined as an HR Executive. You need to assign them their first task: "${task.title}". 

Create a realistic, natural welcome conversation where:
1. You briefly welcome them to the team
2. Introduce a realistic work situation that requires this task
3. Explain why this task is important and relevant
4. Set appropriate context and urgency
5. Ask them how they would approach it or what they think

Make it feel like a real manager-staff conversation, not a formal assignment. Use natural language and realistic workplace context.`,
    
    'hr_t2': `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. You have 10 resumes that need to be reviewed for a position. 

Create a realistic scenario where:
1. You explain the urgency (deadline, position needs, etc.)
2. Provide context about what makes a good candidate
3. Explain what you're looking for
4. Ask them how they would approach the screening

Make it feel urgent and realistic, like a real workplace situation.`,
    
    'hr_t3': `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. Two team members are in a serious conflict that's affecting team productivity. 

Create a realistic, urgent scenario where:
1. You explain the situation with specific details
2. Describe the impact on the team/workplace
3. Explain why it needs immediate attention
4. Ask them how they would handle the conflict resolution

Make it feel like a real workplace escalation that requires professional HR intervention.`,
    
    'hr_t4': `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. The company needs a comprehensive Remote Work Policy document. 

Create a realistic scenario where:
1. Explain why this policy is needed now (company growth, compliance, etc.)
2. Describe what stakeholders need to be considered
3. Explain the scope and requirements
4. Ask them how they would approach creating this policy

Make it feel like a real strategic HR initiative.`,
  };

  return scenarios[task.id] || `You are Sarah Chen, HR Manager. Welcome ${userName} to the HR team and introduce the task: "${task.title}". ${task.description}. Create a natural, professional conversation that introduces this task in a realistic workplace context. Ask them how they would approach it.`;
}

/**
 * Start simulation session
 */
export const startSimulation = async (req, res) => {
  try {
    const { role } = req.body;
    
    // Authentication middleware ensures req.user exists
    const userId = req.user._id;
    const userName = req.user.name;
    
    // Check if MongoDB is connected
    const mongoose = (await import('mongoose')).default;
    const isDbConnected = mongoose.connection.readyState === 1;

    if (!role || !['HR Executive', 'Business Analyst'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Check for existing active session (only if DB is connected)
    if (isDbConnected) {
      try {
        const existingSession = await SimulationSession.findOne({
          userId,
          status: 'active',
        });

        if (existingSession) {
          // Return existing session details instead of error
          console.log(`✅ Returning existing active session: ${existingSession._id}`);
          
          // Get the first message from the session
          const firstMessage = await Message.findOne({
            simulationId: existingSession._id,
          }).sort({ createdAt: 1 });
          
          // Get current task based on session's currentTaskIndex
          const currentTask = getCurrentTask(existingSession.currentTaskIndex);
          
          // Format response same as new session
          return res.status(200).json({
            sessionId: existingSession._id.toString(),
            context: {
              role: existingSession.role,
              department: existingSession.role === 'HR Executive' ? 'Human Resources' : 'Business Analysis',
              currentScenario: currentTask?.title || 'Task 1',
              objectives: [
                'Complete assigned tasks',
                'Interact with team members',
                'Demonstrate professional skills',
              ],
            },
            initialMessage: firstMessage ? {
              id: firstMessage._id.toString(),
              type: 'ai',
              content: firstMessage.text,
              timestamp: firstMessage.createdAt,
              sender: firstMessage.persona || 'Sarah (Manager)',
            } : {
              id: `msg-${Date.now()}`,
              type: 'ai',
              content: `Welcome back to the HR Team! Let's continue with your tasks.`,
              timestamp: existingSession.startedAt || new Date(),
              sender: 'Sarah (Manager)',
            },
            tasks: currentTask ? [{
              id: currentTask.id,
              title: currentTask.title,
              description: currentTask.description,
              status: 'pending',
              priority: currentTask.level === 'advanced' ? 'high' : 'medium',
            }] : [],
          });
        }
      } catch (dbError) {
        console.error('Database error checking session:', dbError.message);
        // Continue without checking existing session
      }
    }
    
    let session;
    let sessionId;
    
    if (isDbConnected) {
      // Create new simulation session in database
      session = await SimulationSession.create({
        userId,
        role,
        status: 'active',
        currentTaskIndex: 0,
        timeline: [{
          type: 'session_started',
          timestamp: new Date(),
          meta: { role },
        }],
      });
      sessionId = session._id.toString();
    } else {
      // Create mock session object for development without DB
      console.log('⚠️  MongoDB not connected - using in-memory session');
      sessionId = `demo-session-${Date.now()}`;
      session = {
        _id: sessionId,
        userId,
        role,
        status: 'active',
        currentTaskIndex: 0,
        timeline: [],
      };
    }

    // Get first task
    const firstTask = getCurrentTask(0);
    
    // Add first task to timeline
    session.timeline.push({
      type: 'task_assigned',
      taskId: firstTask?.id,
      timestamp: new Date(),
      meta: { task: firstTask },
    });
    
    // Save session only if DB is connected
    if (isDbConnected && session.save) {
      await session.save();
    }

    // Generate initial persona message (Manager) using AI
    let initialMessage;
    try {
      if (firstTask) {
        const { generatePersonaResponse } = await import('../services/ai.orchestrator.js');
        
        // Create a realistic HR scenario prompt based on the task
        const scenarioPrompt = generateHRScenarioPrompt(firstTask, role, userName);
        
        const aiResponse = await generatePersonaResponse(
          scenarioPrompt,
          'Manager',
          {
            conversationHistory: [],
            currentTask: firstTask,
            simulationRole: role,
          }
        );
        initialMessage = aiResponse.reply || `Welcome to the HR Team, ${userName}! I'm Sarah, your manager. Here's your first task: ${firstTask.title}. ${firstTask.description}. Let's get started!`;
      } else {
        initialMessage = `Welcome to the HR Team, ${userName}! I'm Sarah, your manager. Let's get started!`;
      }
    } catch (error) {
      console.error('Error generating initial message with AI:', error);
      console.log('Falling back to default message. Make sure OPENAI_API_KEY is set in .env');
      // Fallback to default message if AI fails
      initialMessage = `Welcome to the HR Team, ${userName}! I'm Sarah, your manager. Here's your first task: ${firstTask?.title || 'Task 1'}. ${firstTask?.description || 'Complete the assigned task'}. Let's get started!`;
    }

    // Save initial message only if DB is connected
    let messageId = `msg-${Date.now()}`;
    let messageTimestamp = new Date();
    
    if (isDbConnected) {
      try {
        const msg = await Message.create({
          simulationId: sessionId,
          sender: 'manager',
          persona: 'Manager',
          text: initialMessage,
        });
        messageId = msg._id.toString();
        messageTimestamp = msg.createdAt;
        
        // Update user's roleSelected
        const User = (await import('../models/User.model.js')).default;
        await User.findByIdAndUpdate(userId, { roleSelected: role });
      } catch (dbError) {
        console.error('Database error saving message:', dbError.message);
      }
    }

    res.status(201).json({
      sessionId: sessionId,
      context: {
        role,
        department: role === 'HR Executive' ? 'Human Resources' : 'Business Analysis',
        currentScenario: firstTask?.title || 'Task 1',
        objectives: [
          'Complete assigned tasks',
          'Interact with team members',
          'Demonstrate professional skills',
        ],
      },
      initialMessage: {
        id: messageId,
        type: 'ai',
        content: initialMessage,
        timestamp: messageTimestamp,
        sender: 'Sarah (Manager)',
      },
      tasks: firstTask ? [{
        id: firstTask.id,
        title: firstTask.title,
        description: firstTask.description,
        status: 'pending',
        priority: firstTask.level === 'advanced' ? 'high' : 'medium',
      }] : [],
    });
  } catch (error) {
    console.error('Start simulation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get simulation session
 */
export const getSimulation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const session = await SimulationSession.findOne({
      _id: id,
      userId,
    }).populate('userId', 'name email');

    if (!session) {
      return res.status(404).json({ message: 'Simulation session not found' });
    }

    // Get messages
    const messages = await Message.find({ simulationId: id })
      .sort({ createdAt: 1 });

    res.json({
      session,
      messages,
    });
  } catch (error) {
    console.error('Get simulation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Generate final PDF report
 */
export const generateFinalReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const session = await SimulationSession.findOne({
      _id: id,
      userId,
    }).populate('userId', 'name email');

    if (!session) {
      return res.status(404).json({ message: 'Simulation session not found' });
    }

    // Get all messages and task submissions
    const messages = await Message.find({ simulationId: id });
    const TaskSubmission = (await import('../models/TaskSubmission.model.js')).default;
    const submissions = await TaskSubmission.find({ simulationId: id });

    // Generate PDF
    const pdfBuffer = await generatePDFReport(session, messages, submissions);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=kairo-report-${id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * End simulation session
 */
export const endSimulation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const session = await SimulationSession.findOne({
      _id: id,
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'Active session not found' });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    session.timeline.push({
      type: 'session_ended',
      timestamp: new Date(),
    });

    await session.save();

    res.json({ message: 'Simulation ended successfully', session });
  } catch (error) {
    console.error('End simulation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

