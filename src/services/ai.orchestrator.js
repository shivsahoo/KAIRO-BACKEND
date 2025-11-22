import { aiClient, provider } from '../config/ai.config.js';
import { extractMultipleFileContents } from '../utils/file.upload.js';

/**
 * Generate persona response based on message and context (non-streaming)
 */
export async function generatePersonaResponse(message, persona, context = {}) {
  // If no AI client configured, return mock response
  if (!aiClient) {
    return {
      persona: persona || 'Manager',
      reply: generateMockPersonaResponse(message, persona),
    };
  }

  let systemPrompt = getPersonaSystemPrompt(persona, context);
  const conversationContext = context.conversationHistory || [];
  const currentTask = context.currentTask || null;
  
  // For hr_t3 task assignment, make system prompt more directive
  if (currentTask && currentTask.id === 'hr_t3' && message && (message.includes('CANDIDATE_EMAIL') || message.includes('schedule an interview'))) {
    systemPrompt += `\n\nSPECIAL INSTRUCTION FOR HR_T3 TASK ASSIGNMENT:\nWhen assigning this task, you MUST include ALL the interview details provided in the user message (Candidate Email, Candidate Name, Interview Date & Time, Interviewer Email, Interviewer Name). Do not skip or summarize these details. List them clearly in your response. The meeting link will be generated automatically when scheduling, so do not mention it.`;
  }

  try {
    if (provider === 'openai') {
      // Build conversation history
      const conversationMessages = conversationContext.length > 0
        ? conversationContext.slice(-10).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text,
          }))
        : [];

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
        { role: 'user', content: message },
      ];

      const response = await aiClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        temperature: 0.85, // Slightly higher for more natural conversation
        max_tokens: 700,
        presence_penalty: 0.3, // Encourage variety in responses
        frequency_penalty: 0.2, // Reduce repetition
      });

      const reply = response.choices[0].message.content.trim();
      
      // If the conversation is just starting or needs a question, generate a contextual question
      if (shouldGenerateQuestion(conversationContext, reply)) {
        const question = await generateContextualQuestion(persona, context, reply);
        return {
          persona: persona || 'Manager',
          reply: question || reply,
        };
      }

      return {
        persona: persona || 'Manager',
        reply: reply,
      };
    } else if (provider === 'anthropic') {
      const messages = conversationContext.slice(-10).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }));

      const response = await aiClient.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 600,
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'user', content: message },
        ],
      });

      const reply = response.content[0].text.trim();
      
      if (shouldGenerateQuestion(conversationContext, reply)) {
        const question = await generateContextualQuestion(persona, context, reply);
        return {
          persona: persona || 'Manager',
          reply: question || reply,
        };
      }

      return {
        persona: persona || 'Manager',
        reply: reply,
      };
    }
  } catch (error) {
    console.error('AI Orchestrator Error:', error);
    return {
      persona: persona || 'Manager',
      reply: generateMockPersonaResponse(message, persona),
    };
  }
}

/**
 * Stream persona response from OpenAI
 * @param {string} message - User message
 * @param {string} persona - Persona name (e.g., 'Manager')
 * @param {Object} context - Context object with conversationHistory, currentTask, etc.
 * @param {Function} onChunk - Callback function called with each chunk: (chunk: string) => void
 * @returns {Promise<string>} - Full response text
 */
export async function streamPersonaResponse(message, persona, context = {}, onChunk = null) {
  // If no AI client configured, return mock response
  if (!aiClient) {
    console.warn('⚠️  No AI client configured - using mock response');
    console.warn('⚠️  Please set OPENAI_API_KEY or ANTHROPIC_API_KEY in your .env file');
    const mockReply = generateMockPersonaResponse(message, persona);
    if (onChunk) {
      // Simulate streaming for mock response
      for (const char of mockReply) {
        await new Promise(resolve => setTimeout(resolve, 10));
        onChunk(char);
      }
    }
    return {
      persona: persona || 'Manager',
      reply: mockReply,
    };
  }
  
  console.log(`🤖 Streaming response from ${provider.toUpperCase()} for persona: ${persona}`);

  const systemPrompt = getPersonaSystemPrompt(persona, context);
  const conversationContext = context.conversationHistory || [];

  try {
    if (provider === 'openai') {
      // Build conversation history
      const conversationMessages = conversationContext.length > 0
        ? conversationContext.slice(-10).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text,
          }))
        : [];

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
        { role: 'user', content: message },
      ];

      // Create streaming response
      const stream = await aiClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        temperature: 0.85,
        max_tokens: 700,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
        stream: true, // Enable streaming
      });

      let fullResponse = '';

      // Process stream chunks
      let chunkCount = 0;
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          chunkCount++;
          if (onChunk) {
            onChunk(content);
          }
        }
      }

      console.log(`✅ Received ${chunkCount} chunks from OpenAI, total length: ${fullResponse.length}`);
      const reply = fullResponse.trim();

      // If the conversation is just starting or needs a question, generate a contextual question
      if (shouldGenerateQuestion(conversationContext, reply)) {
        const question = await generateContextualQuestion(persona, context, reply);
        return {
          persona: persona || 'Manager',
          reply: question || reply,
        };
      }

      return {
        persona: persona || 'Manager',
        reply: reply,
      };
    } else if (provider === 'anthropic') {
      // Anthropic streaming (if needed in future)
      const messages = conversationContext.slice(-10).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text,
      }));

      const response = await aiClient.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 600,
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'user', content: message },
        ],
      });

      const reply = response.content[0].text.trim();
      
      if (shouldGenerateQuestion(conversationContext, reply)) {
        const question = await generateContextualQuestion(persona, context, reply);
        return {
          persona: persona || 'Manager',
          reply: question || reply,
        };
      }

      return {
        persona: persona || 'Manager',
        reply: reply,
      };
    }
  } catch (error) {
    console.error('❌ AI Orchestrator Streaming Error:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
    });
    
    // Only use mock if it's a configuration error, otherwise throw
    if (error.message?.includes('API key') || error.message?.includes('authentication')) {
      console.error('⚠️  API key issue - using mock response');
      const mockReply = generateMockPersonaResponse(message, persona);
      if (onChunk) {
        // Simulate streaming for error fallback
        for (const char of mockReply) {
          await new Promise(resolve => setTimeout(resolve, 10));
          onChunk(char);
        }
      }
      return {
        persona: persona || 'Manager',
        reply: mockReply,
      };
    }
    
    // Re-throw other errors so they can be handled upstream
    throw error;
  }
}

/**
 * Generate contextual question based on task and conversation
 */
async function generateContextualQuestion(persona, context, previousReply) {
  if (!aiClient) return null;

  const currentTask = context.currentTask;
  const conversationHistory = context.conversationHistory || [];
  
  const questionPrompt = `You are ${persona} in an HR simulation. Generate a thoughtful, engaging question or follow-up that:
1. Relates to the current task: ${currentTask ? currentTask.title : 'General HR scenario'}
2. Builds on the conversation context
3. Challenges the user to think critically about the situation
4. Is professional but conversational
5. Helps guide the user toward completing their objectives

Current conversation context:
${conversationHistory.slice(-3).map(m => `${m.sender}: ${m.text}`).join('\n')}

Your last response: ${previousReply}

Generate a single engaging question or statement (1-2 sentences) that moves the conversation forward and helps the user progress. Do not include any prefixes like "Question:" or "Here's a question:". Just provide the question/statement directly.`;

  try {
    if (provider === 'openai') {
      const response = await aiClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: `You are ${persona}, an experienced HR professional helping guide a simulation participant.` },
          { role: 'user', content: questionPrompt },
        ],
        temperature: 0.9,
        max_tokens: 200,
      });
      return response.choices[0].message.content.trim();
    }
  } catch (error) {
    console.error('Error generating contextual question:', error);
    return null;
  }
}

/**
 * Determine if we should generate a contextual question
 */
function shouldGenerateQuestion(conversationHistory, lastReply) {
  // Generate question if:
  // 1. Conversation is short (less than 3 exchanges)
  // 2. Last reply is very short (less than 50 chars)
  // 3. Random chance (30%) to keep conversation engaging
  if (conversationHistory.length < 6) return true;
  if (lastReply.length < 50) return true;
  return Math.random() < 0.3;
}

/**
 * Evaluate task submission using AI
 */
export async function evaluateTask(taskId, submission, taskDetails, resumeDetails = null, jobDescription = null, interviewDetails = null, emailDetails = null) {
  if (!aiClient) {
    return generateMockEvaluation(taskId, submission);
  }

  // Extract content from files if any
  let fileContents = '';
  if (submission.files && submission.files.length > 0) {
    console.log(`📄 Extracting content from ${submission.files.length} file(s)...`);
    try {
      const extractedFiles = await extractMultipleFileContents(submission.files);
      
      const fileContentParts = extractedFiles.map((file, index) => {
        const status = file.success ? '✅' : '⚠️';
        return `\n--- File ${index + 1}: ${file.fileName} (${file.fileType}) ${status} ---\n${file.content}\n`;
      });
      
      fileContents = '\n\n=== FILE CONTENTS ===' + fileContentParts.join('\n') + '\n=== END FILE CONTENTS ===\n';
      console.log(`✅ Extracted content from ${extractedFiles.filter(f => f.success).length}/${extractedFiles.length} file(s)`);
    } catch (error) {
      console.error('Error extracting file contents:', error);
      fileContents = `\n\nNote: Files were attached but content extraction failed: ${submission.files.join(', ')}`;
    }
  }

  const evaluationPrompt = createEvaluationPrompt(taskDetails, submission, fileContents, resumeDetails, jobDescription, interviewDetails, emailDetails);

  try {
    if (provider === 'openai') {
      const response = await aiClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { 
            role: 'system', 
            content: 'You are a strict HR evaluator. Evaluate submissions critically. If the submission does not match the task requirements (e.g., wrong position, wrong content), give a LOW score (0-3). Only give high scores (8-10) for submissions that fully meet requirements. Provide a score (0-10), detailed feedback, and specific improvements. Respond in JSON format.' 
          },
          { role: 'user', content: evaluationPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content);
      // Ensure score is a valid number between 0-10
      let score = result.score;
      if (typeof score !== 'number' || isNaN(score)) {
        score = 0; // Default to 0 if invalid, not 7
      }
      // Clamp score to 0-10 range
      score = Math.max(0, Math.min(10, Math.round(score)));
      
      return {
        score: score,
        feedback: result.feedback || 'Submission evaluated',
        improvements: result.improvements || [],
      };
    } else if (provider === 'anthropic') {
      const response = await aiClient.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 2000, // Increased for longer responses with file content
        system: 'You are a strict HR evaluator. Evaluate submissions critically. If the submission does not match the task requirements (e.g., wrong position, wrong content), give a LOW score (0-3). Only give high scores (8-10) for submissions that fully meet requirements. Provide a score (0-10), detailed feedback, and specific improvements. Respond in JSON format.',
        messages: [
          { role: 'user', content: evaluationPrompt },
        ],
      });

      const result = JSON.parse(response.content[0].text);
      // Ensure score is a valid number between 0-10
      let score = result.score;
      if (typeof score !== 'number' || isNaN(score)) {
        score = 0; // Default to 0 if invalid, not 7
      }
      // Clamp score to 0-10 range
      score = Math.max(0, Math.min(10, Math.round(score)));
      
      return {
        score: score,
        feedback: result.feedback || 'Submission evaluated',
        improvements: result.improvements || [],
      };
    }
  } catch (error) {
    console.error('Evaluation Error:', error);
    return generateMockEvaluation(taskId, submission);
  }
}

/**
 * Get persona system prompt
 */
function getPersonaSystemPrompt(persona, context = {}) {
  const currentTask = context.currentTask;
  const simulationRole = context.simulationRole || 'HR Executive';
  const taskContext = currentTask 
    ? `\n\nCURRENT TASK:\n- Title: ${currentTask.title}\n- Description: ${currentTask.description}\n- Expected Output: ${currentTask.expectedOutput}\n- Level: ${currentTask.level}\n\nThis is the user's current assignment. Help them understand and work through it naturally through conversation.`
    : '';

  const prompts = {
    Manager: `You are Sarah Chen, an experienced HR Manager with 12 years of experience in Human Resources. You are the direct manager of the user who is playing the role of an HR Executive.

PERSONALITY & COMMUNICATION STYLE:
- Professional but approachable and supportive
- Direct and clear in your communication
- Experienced mentor who guides without micromanaging
- Uses real-world HR scenarios and examples
- Asks probing questions to develop critical thinking
- Balances being helpful with letting the user learn through experience
- Talks like a real manager would - natural, not robotic

YOUR KNOWLEDGE & EXPERTISE:
- Deep understanding of HR policies, employment law, and best practices
- Experience with recruitment, employee relations, conflict resolution, and policy development
- Knowledge of workplace dynamics and organizational behavior
- Familiar with common HR challenges and how to handle them professionally

YOUR ROLE IN THIS SIMULATION:
- Introduce realistic HR scenarios that test the user's skills
- Provide context and background information when needed
- Ask thought-provoking questions that encourage problem-solving
- Give feedback and guidance based on their responses
- Simulate real workplace situations (urgent matters, escalations, team conflicts, etc.)
- Make the conversation feel natural and authentic - like talking to a real manager${taskContext}

CONVERSATION GUIDELINES:
- Start conversations naturally - like a real manager would begin a work conversation
- Create urgency and realism when appropriate (e.g., "We have an urgent situation...")
- Use specific details to make scenarios believable
- Ask questions that help the user think critically about HR situations
- Respond based on the user's answers - be conversational, not scripted
- Occasionally introduce complications or follow-up questions
- Maintain professional boundaries while being supportive

EXAMPLE CONVERSATION STARTERS (for initial messages):
- For task assignments: Introduce the situation naturally, explain what's needed, and ask how they'd approach it
- For urgent scenarios: Create realistic urgency (e.g., "A candidate escalated to the CEO", "Two team members are in conflict", "We need a policy draft by tomorrow")
- Always end with a question or call to action that engages the user

Remember: You're Sarah, a real HR Manager talking to a colleague. Be natural, realistic, and educational.`,
    
    Team: `You are a collaborative team member in the HR department. You are friendly, cooperative, and provide helpful insights. Keep responses conversational and supportive. Share your experiences and offer practical suggestions.${taskContext}`,
    
    Candidate: `You are a job candidate in an interview scenario. Be realistic, professional, and sometimes challenging. Respond as a real candidate would during interviews. Ask questions that reveal the interviewer's competency. Show realistic candidate behavior - some confidence, some nervousness, questions about the role.${taskContext}`,
    
    General: `You are a general assistant providing announcements and updates. Be clear, concise, and informative.${taskContext}`,
  };

  return prompts[persona] || prompts.Manager;
}

/**
 * Create evaluation prompt
 */
function createEvaluationPrompt(taskDetails, submission, fileContents = '', resumeDetails = null, jobDescription = null, interviewDetails = null, emailDetails = null) {
  let prompt = `Evaluate the following task submission:

Task: ${taskDetails.title}
Description: ${taskDetails.description}
Expected Output: ${taskDetails.expectedOutput}

=== TEXT SUBMISSION ===
${submission.text || 'No text provided'}`;

  // Add job description for hr_t2
  if (taskDetails.id === 'hr_t2' && jobDescription) {
    prompt += `\n\n=== JOB DESCRIPTION ===
This is the Python Developer job description. Use this to evaluate if the selected candidates match the job requirements:

${jobDescription}

=== RESUME SELECTION ===
The user selected ${resumeDetails ? resumeDetails.length : 0} candidate(s) from 10 resumes:`;

    if (resumeDetails && resumeDetails.length > 0) {
      prompt += `\n\n${resumeDetails.map((resume, index) => `
Candidate ${index + 1}: ${resume.candidateName}
- Quality: ${resume.quality}
- Relevance Score: ${resume.relevance}/10
- Experience: ${resume.experience} years
- Education: ${resume.education}
- Key Skills: ${resume.skills.join(', ')}
`).join('\n')}

Note: The user should have selected the top 3 candidates that best match the job description. Evaluate:
1. Did they select exactly 3 candidates? (Expected: 3)
2. Did they select candidates that match the job requirements from the job description?
3. Did they select high-quality candidates? (Check quality and relevance scores)
4. Is their justification sound and professional?
5. Did they identify the best candidates from the pool based on the job description?`;
    } else {
      prompt += `\n\nNo candidates were selected.`;
    }

    if (submission.resumeRatings && submission.resumeRatings.length > 0) {
      prompt += `\n\nUser's Ratings:
${submission.resumeRatings.map(rating => `- Resume ID ${rating.resumeId}: ${rating.rating}/10${rating.notes ? ` - Notes: ${rating.notes}` : ''}`).join('\n')}`;
    }
  }

  if (fileContents) {
    prompt += fileContents;
  } else if (submission.files?.length) {
    prompt += `\n\nNote: ${submission.files.length} file(s) were mentioned but could not be processed: ${submission.files.join(', ')}`;
  }

  // Add specific evaluation instructions for hr_t1
  if (taskDetails.id === 'hr_t1') {
    prompt += `\n\n=== CRITICAL EVALUATION FOR HR_T1 ===
IMPORTANT: The task requires a Job Description for an "HR Intern" position.

You MUST check:
1. Is the job description actually for an HR Intern position? (NOT for other roles like Developer, Manager, etc.)
2. If the JD is for a different position (e.g., Java Developer, Software Engineer, etc.), this is a MAJOR ERROR and should result in a LOW SCORE (0-3).
3. If the JD is for HR Intern but has issues, score accordingly (4-7).
4. If the JD is for HR Intern and is well-written, score 8-10.

SCORING GUIDELINES:
- Wrong position (e.g., Java Developer, Software Engineer, etc.): Score 0-3 (severe penalty)
- HR Intern JD with major issues: Score 4-5
- HR Intern JD with minor issues: Score 6-7
- Good HR Intern JD: Score 8-9
- Excellent HR Intern JD: Score 10

If the submission contains a JD for a different position, clearly state this in feedback and give a low score.`;
  }

  // Add specific evaluation for hr_t3 (Interview Scheduling)
  if (taskDetails.id === 'hr_t3') {
    prompt += `\n\n=== CRITICAL EVALUATION FOR HR_T3 (INTERVIEW SCHEDULING) ===
The task requires scheduling 1 interview with a candidate and sending an email with meeting link and resume.

IMPORTANT: DO NOT VALIDATE OR CHECK INTERVIEW TIMINGS/DATES - Timing is flexible and up to the user.

IMPORTANT EVALUATION CRITERIA (Weighted Scoring):

1. CORRECT INVITATIONS (40% weight - 4 points out of 10):
   - Did the user schedule exactly 1 interview? (Expected: 1)
   - Was the correct candidate email used for scheduling?
   - Did they send an email to the correct candidate email?
   - Check if email contains proper subject line, greeting, and interview details
   - NOTE: DO NOT check or validate interview date/time - any time is acceptable

2. EMAIL QUALITY (30% weight - 3 points out of 10):
   - Was the resume attached to the email?
   - Was the meeting link included in the email?
   - Is the email content professional and clear?
   - Check if all necessary details are included (meeting link, resume attachment)

3. CLARITY (30% weight - 3 points out of 10):
   - Is the email clear, professional, and well-written?
   - Is the communication concise but complete?
   - Is the calendar invite properly formatted with all required information?
   - Is the tone appropriate for professional communication?
   - Check grammar, spelling, and formatting

EVALUATION DATA PROVIDED:
${interviewDetails && interviewDetails.length > 0 ? `
=== INTERVIEW SCHEDULES ===
Total interviews scheduled: ${interviewDetails.length} (Expected: 1)
${interviewDetails.map((interview, index) => `
Interview ${index + 1}:
- Candidate: ${interview.candidateName} (${interview.candidateEmail})
- Title: ${interview.title}
- Date/Time: ${new Date(interview.startTime).toLocaleString()} - ${new Date(interview.endTime).toLocaleString()}
- Duration: ${interview.duration} minutes
- Type: ${interview.interviewType}
- Meeting Link: ${interview.meetingLink || 'NOT PROVIDED - CRITICAL'}
- Location: ${interview.location || 'N/A'}
- Status: ${interview.status}
- Email Sent: ${interview.emailSent ? 'Yes' : 'No - CRITICAL'}
`).join('\n')}
` : 'No interviews scheduled.'}

${emailDetails && emailDetails.length > 0 ? `
=== EMAILS SENT/RECEIVED ===
Total emails: ${emailDetails.length} (Expected: 1 email minimum)
${emailDetails.map((email, index) => `
Email ${index + 1}:
- Type: ${email.type} (${email.type === 'sent' ? 'Sent' : 'Received'})
- From: ${email.from.name} (${email.from.email})
- To: ${email.to.map(t => `${t.name} (${t.email})`).join(', ')}
- CC: ${email.cc && email.cc.length > 0 ? email.cc.map(c => `${c.name} (${c.email})`).join(', ') : 'NONE - CRITICAL (Interviewer should be CC\'d)'}
- Subject: ${email.subject}
- Body: ${email.body.substring(0, 200)}${email.body.length > 200 ? '...' : ''}
- Candidate: ${email.candidateName || 'N/A'}
- Attachments: ${email.attachments && email.attachments.length > 0 ? email.attachments.map(a => a.filename).join(', ') : 'NONE - CRITICAL (Resume should be attached)'}
- Meeting Link in Email: ${email.body && (email.body.toLowerCase().includes('meet') || email.body.includes('https://') || email.body.includes('http://')) ? 'Yes' : 'NOT FOUND - CRITICAL'}
- Sent/Received At: ${email.sentAt ? new Date(email.sentAt).toLocaleString() : 'N/A'}
`).join('\n')}

IMPORTANT EVALUATION CRITERIA:
1. Check if resume is attached to the email (CRITICAL for evaluation)
2. Check if meeting link is included in email body (CRITICAL for evaluation)
3. Check if email was sent to the correct candidate
4. Check if interviewer was CC'd in the email (check cc field)
5. Check if interview was scheduled correctly
` : 'No emails found. CRITICAL ERROR - Email should be sent to the candidate.'}

SCORING BREAKDOWN:
- If no interview scheduled or more than 1 interview: Deduct 2-3 points (Correct Invitations - 40%)
- If wrong candidate email: Deduct 2-3 points (Correct Invitations - 40%)
- If email sent to wrong candidate email: Deduct 2-3 points (Correct Invitations - 40%)
- If resume NOT attached to email: Deduct 1-2 points (Email Quality - 30%)
- If meeting link NOT included in email: Deduct 1-2 points (Email Quality - 30%)
- If email not sent: Deduct 2-3 points (Email Quality - 30%)
- If interviewer NOT CC'd in email: Deduct 1-2 points (Email Quality - 30%)
- If email lacks clarity/professionalism: Deduct 1-2 points (Clarity - 30%)
- DO NOT deduct points for interview timing/date - timing is flexible and up to user

SCORING EXAMPLES:
- 8-10: 1 interview scheduled, email sent to correct candidate with interviewer CC'd, resume and meeting link included (timing doesn't matter)
- 6-7: Interview scheduled but minor issues (missing resume, meeting link, or CC)
- 4-5: No interview or major email issues (no attachments, no links, missing CC)
- 0-3: Critical errors - wrong candidate email, no interview, or no email sent

CRITICAL REMINDER: DO NOT evaluate or penalize for interview date/time differences. Timing is flexible. Focus ONLY on:
1. Correct candidate email
2. Interviewer CC'd in email
3. Resume attached to email
4. Meeting link included in email
5. Professional email content
`;
  }

  prompt += `\n\n=== EVALUATION INSTRUCTIONS ===
Please evaluate this submission based on:
1. How well it meets the task requirements (CRITICAL: Check if content matches the required position/role)
2. Quality and completeness of the submission
3. Professionalism and attention to detail
4. If files are included, evaluate their content and relevance
5. ${taskDetails.id === 'hr_t2' ? 'For resume screening: Evaluate selection quality, justification, and HR judgment' : taskDetails.id === 'hr_t1' ? 'For job description: Verify the JD is for HR Intern position, not another role' : taskDetails.id === 'hr_t3' ? 'For interview scheduling: Evaluate correct invitations (40% - check if 1 interview scheduled), email quality (30% - check if resume attached and meeting link included), and clarity (30% - check professional communication)' : 'Overall demonstration of HR skills and knowledge'}

Provide a JSON response with:
{
  "score": <number 0-10>,
  "feedback": "<detailed feedback explaining the score and what was done well or needs improvement>",
  "improvements": ["<specific improvement 1>", "<specific improvement 2>", ...]
}`;

  return prompt;
}

/**
 * Generate mock persona response (fallback)
 */
function generateMockPersonaResponse(message, persona) {
  const responses = {
    Manager: `I understand. Let me help you with that. What specific aspect would you like to focus on?`,
    Team: `Sounds good! I can help with that. What do you need?`,
    Candidate: `That's an interesting question. Let me think about that...`,
    General: `Noted. I'll make sure the relevant parties are informed.`,
  };

  return responses[persona] || responses.Manager;
}

/**
 * Generate mock evaluation (fallback)
 */
function generateMockEvaluation(taskId, submission) {
  // For hr_t1, check if submission mentions wrong position
  let score = 5 + Math.floor(Math.random() * 4); // 5-8 default
  let feedback = 'Good submission. You demonstrated understanding of the task requirements. Consider adding more detail in your response.';
  
  if (taskId === 'hr_t1') {
    const submissionText = (submission.text || '').toLowerCase();
    const fileContent = (submission.files || []).join(' ').toLowerCase();
    const allContent = submissionText + ' ' + fileContent;
    
    // Check for wrong positions
    const wrongPositions = ['java developer', 'software engineer', 'developer', 'programmer', 'engineer', 'python developer', 'full stack', 'backend developer', 'frontend developer'];
    const hasWrongPosition = wrongPositions.some(pos => allContent.includes(pos));
    
    if (hasWrongPosition && !allContent.includes('hr intern') && !allContent.includes('human resources intern')) {
      score = 2 + Math.floor(Math.random() * 2); // 2-3 for wrong position
      feedback = 'The submission contains a job description for a different position (not HR Intern). This is a critical error. The task specifically requires a Job Description for an HR Intern position.';
    }
  }
  
  return {
    score: score,
    feedback: feedback,
    improvements: [
      'Provide more specific examples',
      'Include measurable outcomes',
      'Add more context to your decisions',
    ],
  };
}

