import { aiClient, provider } from '../config/ai.config.js';

/**
 * Generate persona response based on message and context
 */
export async function generatePersonaResponse(message, persona, context = {}) {
  // If no AI client configured, return mock response
  if (!aiClient) {
    return {
      persona: persona || 'Manager',
      reply: generateMockPersonaResponse(message, persona),
    };
  }

  const systemPrompt = getPersonaSystemPrompt(persona, context);
  const conversationContext = context.conversationHistory || [];
  const currentTask = context.currentTask || null;

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
export async function evaluateTask(taskId, submission, taskDetails) {
  if (!aiClient) {
    return generateMockEvaluation(taskId, submission);
  }

  const evaluationPrompt = createEvaluationPrompt(taskDetails, submission);

  try {
    if (provider === 'openai') {
      const response = await aiClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are an expert HR evaluator. Evaluate the submission and provide a score (1-10), feedback, and improvements.' },
          { role: 'user', content: evaluationPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content);
      return {
        score: result.score || 7,
        feedback: result.feedback || 'Good submission',
        improvements: result.improvements || [],
      };
    } else if (provider === 'anthropic') {
      const response = await aiClient.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1000,
        system: 'You are an expert HR evaluator. Evaluate the submission and provide a score (1-10), feedback, and improvements. Respond in JSON format.',
        messages: [
          { role: 'user', content: evaluationPrompt },
        ],
      });

      const result = JSON.parse(response.content[0].text);
      return {
        score: result.score || 7,
        feedback: result.feedback || 'Good submission',
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
function createEvaluationPrompt(taskDetails, submission) {
  return `Evaluate the following task submission:

Task: ${taskDetails.title}
Description: ${taskDetails.description}
Expected Output: ${taskDetails.expectedOutput}

Submission:
${submission.text || 'No text provided'}
${submission.files?.length ? `Files: ${submission.files.join(', ')}` : ''}

Provide a JSON response with:
{
  "score": <number 1-10>,
  "feedback": "<detailed feedback>",
  "improvements": ["<improvement 1>", "<improvement 2>"]
}`;
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
  return {
    score: 7 + Math.floor(Math.random() * 2), // 7-8
    feedback: 'Good submission. You demonstrated understanding of the task requirements. Consider adding more detail in your response.',
    improvements: [
      'Provide more specific examples',
      'Include measurable outcomes',
      'Add more context to your decisions',
    ],
  };
}

