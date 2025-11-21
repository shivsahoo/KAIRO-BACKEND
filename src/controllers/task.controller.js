import SimulationSession from '../models/SimulationSession.model.js';
import TaskSubmission from '../models/TaskSubmission.model.js';
import Message from '../models/Message.model.js';
import { getCurrentTask, getAllTasks, taskExists, getNextTaskIndex, getTaskById, getTaskByIndex } from '../services/task.service.js';
import { evaluateTask, generatePersonaResponse } from '../services/ai.orchestrator.js';
import { getResumesForTask } from '../services/resume.service.js';
import { getSocketInstance } from '../utils/socket.instance.js';

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
    
    'hr_t2': `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. I've prepared 10 candidate resumes for an HR Intern position that need to be reviewed. 

Create a realistic scenario where:
1. You explain the urgency (deadline, position needs, etc.)
2. Provide context about what makes a good candidate for this role
3. Explain what you're looking for (relevant experience, skills, education, etc.)
4. Mention that 10 resumes are ready for review and they need to shortlist the top 3 candidates
5. Ask them to review the resumes, rate them, and provide justification for their top 3 selections

Make it feel urgent and realistic, like a real workplace situation. The resumes are already prepared and available for review.`,
    
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

  return scenarios[task.id] || `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. Introduce the next task: "${task.title}". ${task.description}. Create a natural, professional conversation that introduces this task in a realistic workplace context. Acknowledge their previous work and transition smoothly to the new task. Ask them how they would approach it.`;
}

/**
 * Get current task
 */
export const getCurrentTaskHandler = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    const currentTask = getCurrentTask(session.currentTaskIndex);

    // Build tasks array with all previous and current tasks
    const tasks = [];
    
    // Get all tasks up to and including current task index
    const totalTasksToShow = currentTask ? session.currentTaskIndex + 1 : session.currentTaskIndex;
    
    for (let i = 0; i < totalTasksToShow; i++) {
      const task = getTaskByIndex(i);
      if (task) {
        const isCurrentTask = i === session.currentTaskIndex;
        
        if (isCurrentTask) {
          // Current task - always pending
          tasks.push({
            id: task.id,
            title: task.title,
            description: task.description,
            level: task.level,
            expectedOutput: task.expectedOutput,
            status: 'pending',
          });
        } else {
          // Previous task - find highest score submission
          const allSubmissions = await TaskSubmission.find({
            simulationId: session._id,
            taskId: task.id,
          });
          
          // Filter submissions with valid scores and sort by score descending
          const submissionsWithScores = allSubmissions
            .filter(sub => sub.score !== null && sub.score !== undefined)
            .sort((a, b) => (b.score || 0) - (a.score || 0));
          
          // Get the best submission (highest score)
          const bestSubmission = submissionsWithScores.length > 0 
            ? submissionsWithScores[0] 
            : (allSubmissions.length > 0 ? allSubmissions[allSubmissions.length - 1] : null); // Fallback to latest if no scores
          
          tasks.push({
            id: task.id,
            title: task.title,
            description: task.description,
            level: task.level,
            expectedOutput: task.expectedOutput,
            status: bestSubmission ? 'completed' : 'pending',
            score: bestSubmission?.score ?? null,
            feedback: bestSubmission?.feedback || null,
            improvements: bestSubmission?.improvements || null,
            submittedAt: bestSubmission?.submittedAt || null,
          });
        }
      }
    }

    const taskResponse = {
      tasks: tasks,
      currentTask: currentTask ? {
        id: currentTask.id,
        title: currentTask.title,
        description: currentTask.description,
        level: currentTask.level,
        expectedOutput: currentTask.expectedOutput,
        status: 'pending',
      } : null,
      taskIndex: session.currentTaskIndex,
      allTasksCompleted: !currentTask,
    };

    // If it's hr_t2, include resumes and hardcoded Python Developer job description
    if (currentTask && currentTask.id === 'hr_t2') {
      try {
        // Hardcoded Python Developer Job Description
        const jobDescription = {
          text: `Job Title: Python Developer

Position Overview:
We are seeking an experienced Python Developer to join our dynamic development team. The ideal candidate will have strong Python programming skills and experience building scalable web applications.

Key Responsibilities:
- Develop and maintain Python-based web applications using Django/Flask
- Design and implement RESTful APIs
- Write clean, maintainable, and efficient code
- Collaborate with cross-functional teams to define and implement new features
- Debug and resolve technical issues
- Participate in code reviews and maintain code quality standards
- Work with databases (PostgreSQL, MongoDB) and optimize queries
- Implement automated testing and CI/CD pipelines

Required Qualifications:
- 2+ years of professional Python development experience
- Strong knowledge of Python and its frameworks (Django, Flask, or FastAPI)
- Experience with REST API development
- Proficiency with SQL databases (PostgreSQL preferred)
- Familiarity with version control systems (Git)
- Understanding of software development best practices
- Strong problem-solving and debugging skills
- Bachelor's degree in Computer Science, Engineering, or related field

Preferred Qualifications:
- Experience with cloud platforms (AWS, Azure, GCP)
- Knowledge of containerization (Docker, Kubernetes)
- Experience with microservices architecture
- Familiarity with frontend technologies (React, Vue.js)
- Understanding of Agile/Scrum methodologies
- Contributions to open-source projects

Technical Skills Required:
- Python (Advanced)
- Django/Flask/FastAPI
- REST APIs
- SQL/PostgreSQL
- Git
- Linux/Unix

This is an excellent opportunity for a Python developer to work on challenging projects and grow their career.`,
          files: [],
          submittedAt: null,
        };

        // Get resumes
        const resumes = await getResumesForTask(session._id);
        
        taskResponse.jobDescription = jobDescription;
        taskResponse.resumes = resumes.map(resume => ({
          id: resume._id.toString(),
          candidateName: resume.candidateName,
          email: resume.email,
          phone: resume.phone,
          experience: resume.experience,
          skills: resume.skills,
          education: resume.education,
          summary: resume.summary,
          workHistory: resume.workHistory,
          resumeText: resume.resumeText,
          // Don't expose quality and relevance to user
        }));
      } catch (error) {
        console.error('Error fetching resumes or job description:', error);
        taskResponse.resumes = [];
        taskResponse.jobDescription = null;
      }
    }

    res.json(taskResponse);
  } catch (error) {
    console.error('Get current task error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Submit task
 */
export const submitTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const { text, files, audioUrl, selectedResumes, resumeRatings } = req.body;

    // Find active simulation session with user populated
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    }).populate('userId', 'name');

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    const currentTask = getCurrentTask(session.currentTaskIndex);

    if (!currentTask) {
      return res.status(400).json({ message: 'No current task to submit' });
    }

    // Create task submission
    const submissionData = {
      simulationId: session._id,
      taskId: currentTask.id,
      userId,
      text,
      files: files || [],
      audioUrl,
    };

    // Add resume selection for hr_t2
    if (currentTask.id === 'hr_t2') {
      if (selectedResumes && Array.isArray(selectedResumes)) {
        submissionData.selectedResumes = selectedResumes;
      }
      if (resumeRatings && Array.isArray(resumeRatings)) {
        submissionData.resumeRatings = resumeRatings;
      }
    }

    const submission = await TaskSubmission.create(submissionData);

    // Get task details for evaluation
    const taskDetails = {
      id: currentTask.id,
      title: currentTask.title,
      description: currentTask.description,
      expectedOutput: currentTask.expectedOutput,
    };

    // For hr_t2, get resume details and job description for evaluation
    let resumeDetails = null;
    let jobDescription = null;
    
    if (currentTask.id === 'hr_t2') {
      // Use hardcoded Python Developer job description
      jobDescription = `Job Title: Python Developer

Position Overview:
We are seeking an experienced Python Developer to join our dynamic development team. The ideal candidate will have strong Python programming skills and experience building scalable web applications.

Key Responsibilities:
- Develop and maintain Python-based web applications using Django/Flask
- Design and implement RESTful APIs
- Write clean, maintainable, and efficient code
- Collaborate with cross-functional teams to define and implement new features
- Debug and resolve technical issues
- Participate in code reviews and maintain code quality standards
- Work with databases (PostgreSQL, MongoDB) and optimize queries
- Implement automated testing and CI/CD pipelines

Required Qualifications:
- 2+ years of professional Python development experience
- Strong knowledge of Python and its frameworks (Django, Flask, or FastAPI)
- Experience with REST API development
- Proficiency with SQL databases (PostgreSQL preferred)
- Familiarity with version control systems (Git)
- Understanding of software development best practices
- Strong problem-solving and debugging skills
- Bachelor's degree in Computer Science, Engineering, or related field

Preferred Qualifications:
- Experience with cloud platforms (AWS, Azure, GCP)
- Knowledge of containerization (Docker, Kubernetes)
- Experience with microservices architecture
- Familiarity with frontend technologies (React, Vue.js)
- Understanding of Agile/Scrum methodologies
- Contributions to open-source projects

Technical Skills Required:
- Python (Advanced)
- Django/Flask/FastAPI
- REST APIs
- SQL/PostgreSQL
- Git
- Linux/Unix

This is an excellent opportunity for a Python developer to work on challenging projects and grow their career.`;

      // Get selected resume details
      if (submission.selectedResumes && submission.selectedResumes.length > 0) {
        const Resume = (await import('../models/Resume.model.js')).default;
        const selectedResumes = await Resume.find({
          _id: { $in: submission.selectedResumes },
        });
        
        resumeDetails = selectedResumes.map(resume => ({
          id: resume._id.toString(),
          candidateName: resume.candidateName,
          quality: resume.quality,
          relevance: resume.relevance,
          experience: resume.experience,
          skills: resume.skills,
          education: resume.education,
        }));
      }
    }

    // Evaluate submission using AI
    const evaluation = await evaluateTask(currentTask.id, submission, taskDetails, resumeDetails, jobDescription);

    // Update submission with evaluation
    submission.score = evaluation.score;
    submission.feedback = evaluation.feedback;
    submission.improvements = evaluation.improvements;
    await submission.save();

    // Update timeline
    session.timeline.push({
      type: 'task_submitted',
      taskId: currentTask.id,
      timestamp: new Date(),
      meta: { submissionId: submission._id },
    });

    session.timeline.push({
      type: 'scored',
      taskId: currentTask.id,
      timestamp: new Date(),
      meta: { score: evaluation.score, feedback: evaluation.feedback },
    });

    // Check if score is 5 or above (0-10 scale) before moving to next task
    const MIN_PASSING_SCORE = 5;
    const score = evaluation.score || 0;
    const canProceed = score >= MIN_PASSING_SCORE;

    let nextTask = null;
    let nextTaskMessage = null;

    // Only move to next task if score is 5 or above
    if (canProceed) {
      // Move to next task
      const nextTaskIndex = getNextTaskIndex(session.currentTaskIndex);
      session.currentTaskIndex = nextTaskIndex;
      nextTask = getCurrentTask(nextTaskIndex);

      // If there's a next task, assign it and generate message
      if (nextTask) {
        session.timeline.push({
        type: 'task_assigned',
        taskId: nextTask.id,
        timestamp: new Date(),
        meta: { task: nextTask },
      });

      // Get user name for message generation
      const userName = session.userId?.name || 'there';
      const role = session.role;

      // Generate AI message for the new task
      try {
        // For hr_t2, resumes are already pre-generated (shared), so no need to generate
        const scenarioPrompt = generateHRScenarioPrompt(nextTask, role, userName);
        
        // Get conversation history for context
        const recentMessages = await Message.find({
          simulationId: session._id,
        })
          .sort({ createdAt: -1 })
          .limit(10);
        
        // Reverse to get chronological order
        recentMessages.reverse();

        const conversationHistory = recentMessages.map(msg => ({
          sender: msg.sender === 'user' ? 'user' : 'assistant',
          text: msg.text,
        }));

        const aiResponse = await generatePersonaResponse(
          scenarioPrompt,
          'Manager',
          {
            conversationHistory,
            currentTask: nextTask,
            simulationRole: role,
          }
        );

        const taskMessageText = aiResponse.reply || `Great work on the previous task! Now I have a new assignment for you: ${nextTask.title}. ${nextTask.description}. Let's get started!`;

        // Save the message to database
        const taskMessage = await Message.create({
          simulationId: session._id,
          sender: 'manager',
          persona: 'Manager',
          text: taskMessageText,
        });

        nextTaskMessage = {
          id: taskMessage._id.toString(),
          type: 'ai',
          content: taskMessageText,
          timestamp: taskMessage.createdAt,
          sender: 'Sarah (Manager)',
        };

        // Update timeline
        session.timeline.push({
          type: 'message',
          timestamp: new Date(),
          meta: { messageId: taskMessage._id },
        });

      } catch (error) {
        console.error('Error generating new task message:', error);
        // Fallback message
        const fallbackText = `Great work on completing the previous task! Now I have a new assignment for you: ${nextTask.title}. ${nextTask.description}. Let's get started!`;
        
        try {
          const taskMessage = await Message.create({
            simulationId: session._id,
            sender: 'manager',
            persona: 'Manager',
            text: fallbackText,
          });

          nextTaskMessage = {
            id: taskMessage._id.toString(),
            type: 'ai',
            content: fallbackText,
            timestamp: taskMessage.createdAt,
            sender: 'Sarah (Manager)',
          };
        } catch (dbError) {
          console.error('Error saving fallback message:', dbError);
        }
      }

      // Send task assigned message via socket
      const io = getSocketInstance();
      if (io) {
        io.to(session._id.toString()).emit('task_assigned', {
          task: {
            id: nextTask.id,
            title: nextTask.title,
            description: nextTask.description,
            level: nextTask.level,
            expectedOutput: nextTask.expectedOutput,
            status: 'pending',
          },
        });

        // Emit the new task message via socket
        if (nextTaskMessage) {
          io.to(session._id.toString()).emit('new_message', nextTaskMessage);
        }
      }
      }
    } else {
      // Score is below 5 - stay on current task
      console.log(`⚠️ Score ${score}/10 is below ${MIN_PASSING_SCORE}. User must retry task.`);
    }

    await session.save();

    // Emit task scored event via socket
    const io = getSocketInstance();
    if (io) {
      io.to(session._id.toString()).emit('task_scored', {
      taskId: currentTask.id,
      score: evaluation.score,
      feedback: evaluation.feedback,
      improvements: evaluation.improvements,
      });
    }

    res.status(201).json({
      submission: {
        id: submission._id,
        taskId: currentTask.id,
        score: evaluation.score,
        feedback: evaluation.feedback,
        improvements: evaluation.improvements,
      },
      canProceed: canProceed,
      message: canProceed 
        ? `Great work! You scored ${score}/10. You can proceed to the next task.`
        : `Your score is ${score}/10. You need at least ${MIN_PASSING_SCORE}/10 to proceed. Please review the feedback and resubmit.`,
      nextTask: nextTask ? {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
        level: nextTask.level,
        expectedOutput: nextTask.expectedOutput,
        status: 'pending',
      } : null,
      nextTaskMessage: nextTaskMessage,
      completed: !nextTask,
      scoreInfo: {
        min: 0,
        max: 10,
        passingScore: MIN_PASSING_SCORE,
        currentScore: score,
      },
    });
  } catch (error) {
    console.error('Submit task error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Resubmit task (re-upload to update score)
 */
export const resubmitTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const { text, files, audioUrl, selectedResumes, resumeRatings } = req.body;
    const { taskId } = req.params;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    }).populate('userId', 'name');

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    // Get the task
    const task = getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if current task matches
    const currentTask = getCurrentTask(session.currentTaskIndex);
    if (currentTask?.id !== taskId) {
      return res.status(400).json({ message: 'Task ID does not match current task' });
    }

    // Find existing submission
    const existingSubmission = await TaskSubmission.findOne({
      simulationId: session._id,
      taskId: taskId,
    }).sort({ createdAt: -1 });

    if (!existingSubmission) {
      return res.status(404).json({ message: 'No previous submission found for this task' });
    }

    // Create new submission with updated data
    const submissionData = {
      simulationId: session._id,
      taskId: taskId,
      userId,
      text: text !== undefined ? text : existingSubmission.text,
      files: files !== undefined ? files : existingSubmission.files,
      audioUrl: audioUrl !== undefined ? audioUrl : existingSubmission.audioUrl,
    };

    // Add resume selection for hr_t2
    if (taskId === 'hr_t2') {
      if (selectedResumes && Array.isArray(selectedResumes)) {
        submissionData.selectedResumes = selectedResumes;
      } else {
        submissionData.selectedResumes = existingSubmission.selectedResumes || [];
      }
      if (resumeRatings && Array.isArray(resumeRatings)) {
        submissionData.resumeRatings = resumeRatings;
      } else {
        submissionData.resumeRatings = existingSubmission.resumeRatings || [];
      }
    }

    const submission = await TaskSubmission.create(submissionData);

    // Get task details for evaluation
    const taskDetails = {
      id: task.id,
      title: task.title,
      description: task.description,
      expectedOutput: task.expectedOutput,
    };

    // For hr_t2, get resume details and job description for evaluation
    let resumeDetails = null;
    let jobDescription = null;
    
    if (taskId === 'hr_t2') {
      // Use hardcoded Python Developer job description
      jobDescription = `Job Title: Python Developer

Position Overview:
We are seeking an experienced Python Developer to join our dynamic development team. The ideal candidate will have strong Python programming skills and experience building scalable web applications.

Key Responsibilities:
- Develop and maintain Python-based web applications using Django/Flask
- Design and implement RESTful APIs
- Write clean, maintainable, and efficient code
- Collaborate with cross-functional teams to define and implement new features
- Debug and resolve technical issues
- Participate in code reviews and maintain code quality standards
- Work with databases (PostgreSQL, MongoDB) and optimize queries
- Implement automated testing and CI/CD pipelines

Required Qualifications:
- 2+ years of professional Python development experience
- Strong knowledge of Python and its frameworks (Django, Flask, or FastAPI)
- Experience with REST API development
- Proficiency with SQL databases (PostgreSQL preferred)
- Familiarity with version control systems (Git)
- Understanding of software development best practices
- Strong problem-solving and debugging skills
- Bachelor's degree in Computer Science, Engineering, or related field

Preferred Qualifications:
- Experience with cloud platforms (AWS, Azure, GCP)
- Knowledge of containerization (Docker, Kubernetes)
- Experience with microservices architecture
- Familiarity with frontend technologies (React, Vue.js)
- Understanding of Agile/Scrum methodologies
- Contributions to open-source projects

Technical Skills Required:
- Python (Advanced)
- Django/Flask/FastAPI
- REST APIs
- SQL/PostgreSQL
- Git
- Linux/Unix

This is an excellent opportunity for a Python developer to work on challenging projects and grow their career.`;

      // Get selected resume details
      if (submission.selectedResumes && submission.selectedResumes.length > 0) {
        const Resume = (await import('../models/Resume.model.js')).default;
        const selectedResumes = await Resume.find({
          _id: { $in: submission.selectedResumes },
        });
        
        resumeDetails = selectedResumes.map(resume => ({
          id: resume._id.toString(),
          candidateName: resume.candidateName,
          quality: resume.quality,
          relevance: resume.relevance,
          experience: resume.experience,
          skills: resume.skills,
          education: resume.education,
        }));
      }
    }

    // Evaluate submission using AI
    const evaluation = await evaluateTask(taskId, submission, taskDetails, resumeDetails, jobDescription);

    // Update submission with evaluation
    submission.score = evaluation.score;
    submission.feedback = evaluation.feedback;
    submission.improvements = evaluation.improvements;
    await submission.save();

    // Update timeline
    session.timeline.push({
      type: 'task_submitted',
      taskId: taskId,
      timestamp: new Date(),
      meta: { submissionId: submission._id, isResubmission: true },
    });

    session.timeline.push({
      type: 'scored',
      taskId: taskId,
      timestamp: new Date(),
      meta: { score: evaluation.score, feedback: evaluation.feedback },
    });

    // Check if score is 5 or above (0-10 scale) before moving to next task
    const MIN_PASSING_SCORE = 5;
    const score = evaluation.score || 0;
    const canProceed = score >= MIN_PASSING_SCORE;

    let nextTask = null;
    let nextTaskMessage = null;

    // Only move to next task if score is 5 or above
    if (canProceed) {
      // Move to next task
      const nextTaskIndex = getNextTaskIndex(session.currentTaskIndex);
      session.currentTaskIndex = nextTaskIndex;
      nextTask = getCurrentTask(nextTaskIndex);

      // If there's a next task, assign it and generate message
      if (nextTask) {
        session.timeline.push({
          type: 'task_assigned',
          taskId: nextTask.id,
          timestamp: new Date(),
          meta: { task: nextTask },
        });

        // Get user name for message generation
        const userName = session.userId?.name || 'there';
        const role = session.role;

        // Generate AI message for the new task
        try {
          const scenarioPrompt = generateHRScenarioPrompt(nextTask, role, userName);
          
          // Get conversation history for context
          const recentMessages = await Message.find({
            simulationId: session._id,
          })
            .sort({ createdAt: -1 })
            .limit(10);
          
          recentMessages.reverse();

          const conversationHistory = recentMessages.map(msg => ({
            sender: msg.sender === 'user' ? 'user' : 'assistant',
            text: msg.text,
          }));

          const aiResponse = await generatePersonaResponse(
            scenarioPrompt,
            'Manager',
            {
              conversationHistory,
              currentTask: nextTask,
              simulationRole: role,
            }
          );

          const taskMessageText = aiResponse.reply || `Great work on the previous task! Now I have a new assignment for you: ${nextTask.title}. ${nextTask.description}. Let's get started!`;

          // Save the message to database
          const taskMessage = await Message.create({
            simulationId: session._id,
            sender: 'manager',
            persona: 'Manager',
            text: taskMessageText,
          });

          nextTaskMessage = {
            id: taskMessage._id.toString(),
            type: 'ai',
            content: taskMessageText,
            timestamp: taskMessage.createdAt,
            sender: 'Sarah (Manager)',
          };

          // Update timeline
          session.timeline.push({
            type: 'message',
            timestamp: new Date(),
            meta: { messageId: taskMessage._id },
          });

        } catch (error) {
          console.error('Error generating new task message:', error);
          const fallbackText = `Great work on completing the previous task! Now I have a new assignment for you: ${nextTask.title}. ${nextTask.description}. Let's get started!`;
          
          try {
            const taskMessage = await Message.create({
              simulationId: session._id,
              sender: 'manager',
              persona: 'Manager',
              text: fallbackText,
            });

            nextTaskMessage = {
              id: taskMessage._id.toString(),
              type: 'ai',
              content: fallbackText,
              timestamp: taskMessage.createdAt,
              sender: 'Sarah (Manager)',
            };
          } catch (dbError) {
            console.error('Error saving fallback message:', dbError);
          }
        }

        // Send task assigned message via socket
        const io = getSocketInstance();
        if (io) {
          io.to(session._id.toString()).emit('task_assigned', {
            task: {
              id: nextTask.id,
              title: nextTask.title,
              description: nextTask.description,
              level: nextTask.level,
              expectedOutput: nextTask.expectedOutput,
              status: 'pending',
            },
          });

          if (nextTaskMessage) {
            io.to(session._id.toString()).emit('new_message', nextTaskMessage);
          }
        }
      }
    } else {
      console.log(`⚠️ Resubmission score ${score}/10 is below ${MIN_PASSING_SCORE}. User must retry task.`);
    }

    await session.save();

    // Emit task scored event via socket
    const io = getSocketInstance();
    if (io) {
      io.to(session._id.toString()).emit('task_scored', {
        taskId: taskId,
        score: evaluation.score,
        feedback: evaluation.feedback,
        improvements: evaluation.improvements,
        isResubmission: true,
      });
    }

    res.status(201).json({
      submission: {
        id: submission._id,
        taskId: taskId,
        score: evaluation.score,
        feedback: evaluation.feedback,
        improvements: evaluation.improvements,
        isResubmission: true,
      },
      canProceed: canProceed,
      message: canProceed 
        ? `Great work! You scored ${score}/10. You can proceed to the next task.`
        : `Your score is ${score}/10. You need at least ${MIN_PASSING_SCORE}/10 to proceed. Please review the feedback and resubmit.`,
      nextTask: nextTask ? {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
        level: nextTask.level,
        expectedOutput: nextTask.expectedOutput,
        status: 'pending',
      } : null,
      nextTaskMessage: nextTaskMessage,
      completed: !nextTask,
      scoreInfo: {
        min: 0,
        max: 10,
        passingScore: MIN_PASSING_SCORE,
        currentScore: score,
      },
    });
  } catch (error) {
    console.error('Resubmit task error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all tasks
 */
export const getAllTasksHandler = async (req, res) => {
  try {
    const tasks = getAllTasks();

    res.json({
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        level: task.level,
        expectedOutput: task.expectedOutput,
      })),
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

