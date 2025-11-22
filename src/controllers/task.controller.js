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
    
    'hr_t2': `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. They just completed writing the Job Description for an HR Intern position.

YOUR RESPONSE MUST:
1. Briefly acknowledge their completion of the JD task (1 sentence): "Great work on completing the Job Description!" or "Nice job on the Job Description!"
2. Directly assign the next task: "Now I need you to complete the resume screening task."
3. Explain what they need to do: "I've prepared 5 candidate resumes for the HR Intern position. Please review all 5 resumes, rate them, and shortlist the top 2 candidates with your justification for each selection."

Keep it professional, direct, and clear. The resumes are ready for review.`,
    
    'hr_t3': `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. I need you to schedule an interview for a shortlisted candidate.

YOUR RESPONSE MUST START WITH: "I need you to schedule an interview with the following details:"

Then list these details EXACTLY as shown:
- Candidate Email: [CANDIDATE_EMAIL]
- Candidate Name: [CANDIDATE_NAME]
- Interview Date & Time: [START_TIME] to [END_TIME]
- Interview Type: video
- Interviewer Email: [INTERVIEWER_EMAIL]
- Interviewer Name: [INTERVIEWER_NAME]
- Title: Interview - Python Developer Position

Then provide these task instructions:
1. Schedule the interview using the candidate email ([CANDIDATE_EMAIL]) and time ([START_TIME] to [END_TIME])
2. Send an email to the candidate ([CANDIDATE_EMAIL]) with the resume attached
3. CC the interviewer ([INTERVIEWER_EMAIL]) in the email

IMPORTANT: The meeting link will be generated automatically when you schedule the interview in the calendar, so do not mention it in your message. Just include the email addresses, candidate name, interview time, and interviewer details.

Write this as a professional, clear task assignment. Include ALL the details listed above in your response.`,
    
    'hr_t4': `You are Sarah Chen, HR Manager. ${userName} is your HR Executive. We need to screen candidates for our Software Developer position, and I'd like you to conduct a mock HR screening call.

Create a realistic scenario where:
1. Explain the importance of phone screening in the recruitment process
2. Mention that you've set up an AI-powered candidate simulation for practice
3. Provide context about the Software Developer role requirements
4. Instruct them to conduct a 10-15 minute screening call
5. Ask them to evaluate the candidate's communication, technical background, and cultural fit

After the call, they should provide:
- Call transcript or detailed notes
- Assessment of the candidate's suitability
- Key observations and recommendations

Make it feel like a real HR training scenario with practical guidance.`,
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

    // If it's hr_t3, include candidates from resumes
    if (currentTask && currentTask.id === 'hr_t3') {
      try {
        // Get candidates from resumes (use shared resumes or create interview-specific ones)
        const { getSharedResumes } = await import('../services/resume.service.js');
        const resumes = await getSharedResumes();
        
        // Select 4-5 candidates for interviews (prefer good/excellent quality)
        const candidates = resumes
          .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
          .slice(0, 5)
          .map(resume => ({
            id: resume._id.toString(),
            candidateName: resume.candidateName,
            email: resume.email,
            phone: resume.phone,
            experience: resume.experience,
            skills: resume.skills,
            education: resume.education,
            summary: resume.summary,
            // Don't expose quality and relevance
          }));
        
        taskResponse.candidates = candidates;
      } catch (error) {
        console.error('Error fetching candidates for hr_t3:', error);
        taskResponse.candidates = [];
      }
    }
    
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

    // Add interview schedules and emails for hr_t3
    if (currentTask.id === 'hr_t3') {
      if (req.body.interviewIds && Array.isArray(req.body.interviewIds)) {
        submissionData.interviewIds = req.body.interviewIds;
      }
      if (req.body.emailIds && Array.isArray(req.body.emailIds)) {
        submissionData.emailIds = req.body.emailIds;
      }
    }

    // Add transcript for hr_t4
    if (currentTask.id === 'hr_t4') {
      if (req.body.transcriptId) {
        submissionData.transcriptId = req.body.transcriptId;
      }
      // Transcript text is already in submissionData.text
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

    // For hr_t4, get transcript details for evaluation
    let transcriptDetails = null;
    
    if (currentTask.id === 'hr_t4') {
      const InterviewTranscript = (await import('../models/InterviewTranscript.model.js')).default;
      
      // Try to find transcript by sessionId or get latest transcript for user
      if (submission.transcriptId) {
        const transcript = await InterviewTranscript.findOne({
          _id: submission.transcriptId,
          userId: session.userId,
        });
        
        if (transcript) {
          transcriptDetails = {
            id: transcript._id.toString(),
            sessionId: transcript.sessionId,
            startTime: transcript.startTime,
            endTime: transcript.endTime,
            duration: transcript.duration,
            messageCount: transcript.transcript.length,
            transcript: transcript.transcript,
          };
        }
      } else {
        // Get latest transcript for user if no ID provided
        const latestTranscript = await InterviewTranscript.findOne({
          userId: session.userId,
        }).sort({ createdAt: -1 });
        
        if (latestTranscript) {
          transcriptDetails = {
            id: latestTranscript._id.toString(),
            sessionId: latestTranscript.sessionId,
            startTime: latestTranscript.startTime,
            endTime: latestTranscript.endTime,
            duration: latestTranscript.duration,
            messageCount: latestTranscript.transcript.length,
            transcript: latestTranscript.transcript,
          };
        }
      }
    }

    // For hr_t3, get interview schedules and emails for evaluation
    let interviewDetails = null;
    let emailDetails = null;
    
    if (currentTask.id === 'hr_t3') {
      const InterviewSchedule = (await import('../models/InterviewSchedule.model.js')).default;
      const Email = (await import('../models/Email.model.js')).default;
      
      // Automatically fetch ALL interview schedules and emails for this task (no need for IDs in submission)
      const allInterviews = await InterviewSchedule.find({
        simulationId: session._id,
        taskId: 'hr_t3',
        userId: session.userId,
      }).populate('candidateId').sort({ createdAt: -1 }); // Most recent first
      
      interviewDetails = allInterviews.map(interview => ({
        id: interview._id.toString(),
        candidateId: interview.candidateId?._id?.toString(),
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail,
        interviewerName: interview.interviewerName,
        interviewerEmail: interview.interviewerEmail,
        title: interview.title,
        startTime: interview.startTime,
        endTime: interview.endTime,
        duration: interview.duration,
        interviewType: interview.interviewType,
        location: interview.location,
        meetingLink: interview.meetingLink,
        status: interview.status,
        emailSent: interview.emailSent,
      }));
      
      // Automatically fetch ALL sent emails for this task
      const allEmails = await Email.find({
        simulationId: session._id,
        taskId: 'hr_t3',
        userId: session.userId,
        type: 'sent', // Only sent emails for evaluation
      }).sort({ sentAt: -1 }); // Most recent first
      
      // Group emails by candidate email and keep only the latest one for each candidate
      const latestEmailsMap = new Map();
      allEmails.forEach(email => {
        const candidateEmail = email.to && email.to.length > 0 ? email.to[0].email : null;
        if (candidateEmail) {
          // Only keep the first (most recent) email for each candidate email
          if (!latestEmailsMap.has(candidateEmail)) {
            latestEmailsMap.set(candidateEmail, email);
          }
        }
      });
      
      // Convert map to array of email details (only latest emails)
      emailDetails = Array.from(latestEmailsMap.values()).map(email => ({
        id: email._id.toString(),
        type: email.type,
        from: email.from,
        to: email.to,
        cc: email.cc || [], // Include CC for evaluation
        subject: email.subject,
        body: email.body,
        attachments: email.attachments || [], // Include attachments for evaluation
        candidateId: email.candidateId?.toString(),
        candidateName: email.candidateName,
        interviewScheduleId: email.interviewScheduleId?.toString(),
        sentAt: email.sentAt,
      }));
    }

    // Evaluate submission using AI
    const evaluation = await evaluateTask(currentTask.id, submission, taskDetails, resumeDetails, jobDescription, interviewDetails, emailDetails, transcriptDetails);

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

    // Check if score is 3 or above (0-10 scale) before moving to next task
    const MIN_PASSING_SCORE = 3;
    const score = evaluation.score || 0;
    const canProceed = score >= MIN_PASSING_SCORE;

    let nextTask = null;
    let nextTaskMessage = null;

    // Only move to next task if score is 3 or above
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
        let nextTaskMessageContent = '';
        
        // For hr_t2, hardcode the message after completing JD task
        if (nextTask.id === 'hr_t2') {
          nextTaskMessageContent = `Great work on completing the Job Description! Now I need you to complete the resume screening task.

I've prepared 5 candidate resumes for the HR Intern position. Please review all 5 resumes, rate them, and shortlist the top 2 candidates with your justification for each selection.`;
        }
        
        // For hr_t3, hardcode the message with actual candidate details to avoid AI hallucination
        if (nextTask.id === 'hr_t3') {
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
          
          // Generate resume download URL - use the API base URL from environment or default
          // Note: Routes are mounted at /api/interviews (with 's')
          const apiBaseUrl = process.env.API_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
          const resumeDownloadUrl = `${apiBaseUrl}/api/interviews/resume/${candidate._id.toString()}/download`;
          
          // Hardcode the message to avoid AI hallucination
          nextTaskMessageContent = `Great work on the previous task! Now I need you to schedule an interview with the following details:

**Interview Details:**
- Candidate Email: ${candidate.email}
- Candidate Name: ${candidate.candidateName}
- Interview Date & Time: ${startTimeReadable} to ${endTimeReadable}
- Interview Type: video
- Interviewer Email: ${interviewerEmail}
- Interviewer Name: ${interviewerName}
- Title: Interview - Python Developer Position
- Resume: [Download Resume PDF](${resumeDownloadUrl})

**Task Instructions:**
1. Schedule the interview using the candidate email (${candidate.email}) and the time slot above
2. Send an email to the candidate (${candidate.email}) with the resume attached
3. Make sure to CC the interviewer (${interviewerEmail}) in the email

Please schedule this interview and send the email. Let me know once you've completed both tasks.`;
        }
        
        // If not hr_t3 or no hardcoded message, generate AI response
        if (!nextTaskMessageContent) {
          let scenarioPrompt = generateHRScenarioPrompt(nextTask, role, userName);
          
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

          nextTaskMessageContent = aiResponse.reply || `Great work on the previous task! Now I have a new assignment for you: ${nextTask.title}. ${nextTask.description}. Let's get started!`;
        }

        const taskMessageText = nextTaskMessageContent;

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
      // Score is below 3 - stay on current task
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

    // Note: Removed task validation - users can resubmit ANY task at ANY time
    // This allows flexibility to improve scores for previous tasks while working on current task

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

    // Add interview schedules and emails for hr_t3
    if (taskId === 'hr_t3') {
      if (req.body.interviewIds && Array.isArray(req.body.interviewIds)) {
        submissionData.interviewIds = req.body.interviewIds;
      } else {
        submissionData.interviewIds = existingSubmission.interviewIds || [];
      }
      if (req.body.emailIds && Array.isArray(req.body.emailIds)) {
        submissionData.emailIds = req.body.emailIds;
      } else {
        submissionData.emailIds = existingSubmission.emailIds || [];
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

    // For hr_t3, automatically fetch all interviews and emails for evaluation
    let interviewDetails = null;
    let emailDetails = null;
    
    if (taskId === 'hr_t3') {
      const InterviewSchedule = (await import('../models/InterviewSchedule.model.js')).default;
      const Email = (await import('../models/Email.model.js')).default;
      
      // Automatically fetch all interview schedules for this task (not just submitted ones)
      const interviews = await InterviewSchedule.find({
        simulationId: session._id,
        taskId: 'hr_t3',
        userId: session.userId,
      }).populate('candidateId').sort({ createdAt: -1 }); // Most recent first
      
      if (interviews && interviews.length > 0) {
        
        interviewDetails = interviews.map(interview => ({
          id: interview._id.toString(),
          candidateId: interview.candidateId?._id?.toString(),
          candidateName: interview.candidateName,
          candidateEmail: interview.candidateEmail,
          title: interview.title,
          startTime: interview.startTime,
          endTime: interview.endTime,
          duration: interview.duration,
          interviewType: interview.interviewType,
          location: interview.location,
          meetingLink: interview.meetingLink,
          status: interview.status,
          emailSent: interview.emailSent,
        }));
      }
      
      // Get emails
      if (submission.emailIds && submission.emailIds.length > 0) {
        const emails = await Email.find({
          _id: { $in: submission.emailIds },
        }).populate('candidateId');
        
        emailDetails = emails.map(email => ({
          id: email._id.toString(),
          type: email.type,
          from: email.from,
          to: email.to,
          subject: email.subject,
          body: email.body,
          attachments: email.attachments || [], // Include attachments for evaluation
          cc: email.cc || [], // Include CC for evaluation
          candidateId: email.candidateId?._id?.toString(),
          candidateName: email.candidateName,
          interviewScheduleId: email.interviewScheduleId?.toString(),
          sentAt: email.sentAt,
        }));
      }
      
      // Get all interviews and emails if not provided in submission
      if (!interviewDetails || interviewDetails.length === 0) {
        const allInterviews = await InterviewSchedule.find({
          simulationId: session._id,
          taskId: 'hr_t3',
        }).populate('candidateId');
        
        interviewDetails = allInterviews.map(interview => ({
          id: interview._id.toString(),
          candidateId: interview.candidateId?._id?.toString(),
          candidateName: interview.candidateName,
          candidateEmail: interview.candidateEmail,
          title: interview.title,
          startTime: interview.startTime,
          endTime: interview.endTime,
          duration: interview.duration,
          interviewType: interview.interviewType,
          location: interview.location,
          meetingLink: interview.meetingLink,
          status: interview.status,
          emailSent: interview.emailSent,
        }));
      }
      
      if (!emailDetails || emailDetails.length === 0) {
        const allEmails = await Email.find({
          simulationId: session._id,
          taskId: 'hr_t3',
          type: 'sent',
        }).sort({ sentAt: -1 }); // Most recent first
        
        // Group emails by candidate email and keep only the latest one for each candidate
        const latestEmailsMap = new Map();
        allEmails.forEach(email => {
          const candidateEmail = email.to && email.to.length > 0 ? email.to[0].email : null;
          if (candidateEmail) {
            // Only keep the first (most recent) email for each candidate email
            if (!latestEmailsMap.has(candidateEmail)) {
              latestEmailsMap.set(candidateEmail, email);
            }
          }
        });
        
        // Convert map to array of email details (only latest emails)
        emailDetails = Array.from(latestEmailsMap.values()).map(email => ({
          id: email._id.toString(),
          type: email.type,
          from: email.from,
          to: email.to,
          cc: email.cc || [], // Include CC for evaluation
          subject: email.subject,
          body: email.body,
          attachments: email.attachments || [], // Include attachments for evaluation
          candidateId: email.candidateId?.toString(),
          candidateName: email.candidateName,
          interviewScheduleId: email.interviewScheduleId?.toString(),
          sentAt: email.sentAt,
        }));
      }
    }

    // Evaluate submission using AI
    const evaluation = await evaluateTask(taskId, submission, taskDetails, resumeDetails, jobDescription, interviewDetails, emailDetails);

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

    // Check if score is 3 or above (0-10 scale) before moving to next task
    const MIN_PASSING_SCORE = 3;
    const score = evaluation.score || 0;
    const canProceed = score >= MIN_PASSING_SCORE;

    let nextTask = null;
    let nextTaskMessage = null;

    // Only move to next task if score is 3 or above
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

