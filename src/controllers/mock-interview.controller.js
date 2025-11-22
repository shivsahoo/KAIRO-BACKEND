import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import OpenAI, { toFile } from 'openai';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getActiveInterviews, processAudioBuffer } from '../services/mock-interview.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Use shared state from service
const activeInterviews = getActiveInterviews();

// Helper function to ensure room exists (agent dispatch is handled via token + queue)
async function dispatchAgentToRoom(roomName) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'wss://kairo-imiootqz.livekit.cloud';

  if (!apiKey || !apiSecret) {
    console.warn('⚠️ LiveKit credentials not configured - skipping room creation');
    return;
  }

  // Convert wss:// to https:// for HTTP API
  const httpUrl = livekitUrl.replace('wss://', 'https://');

  try {
    // Initialize LiveKit RoomService client
    const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);

    // Ensure room exists so queue-dispatched agent has somewhere to join
    try {
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 300, // 5 minutes
        maxParticipants: 10,
      });
      console.log(`✅ Room created: ${roomName}`);
    } catch (error) {
      // Room might already exist, that's okay
      if (error.message?.includes('already exists') || error.code === 409) {
        console.log(`ℹ️ Room ${roomName} already exists`);
      } else {
        console.log(`ℹ️ Room status: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Error ensuring room exists:', error.message);
    // Don't throw - token-based queue dispatch should still work
  }
}

// Candidate personas
const PERSONAS = {
  'junior-frontend-developer': {
    name: 'Alex Kumar',
    role: 'Junior Frontend Developer',
    experience: '1 year',
    description: 'Entry-level candidate with 1 year of experience in React',
    characteristics: ['Eager to learn', 'Basic React knowledge', 'Somewhat nervous', 'Enthusiastic'],
    systemPrompt: `You are Alex Kumar, a junior frontend developer candidate being interviewed for a Software Developer position. 
    
You have:
- 1 year of experience with React and JavaScript
- Bachelor's degree in Computer Science (graduated last year)
- Built 2 small personal projects
- Basic knowledge of HTML, CSS, Git
- You're eager to learn and enthusiastic but can be a bit nervous

Personality:
- Friendly and enthusiastic
- Sometimes ramble when nervous
- Ask clarifying questions when unsure
- Show genuine interest in the role
- Occasionally mention your eagerness to learn

Keep responses conversational, natural, and under 100 words. Show appropriate nervousness for a junior candidate but remain professional.`,
  },
  'mid-level-backend-developer': {
    name: 'Sarah Johnson',
    role: 'Mid-Level Backend Developer',
    experience: '4 years',
    description: 'Experienced backend developer with 4 years in Node.js and Python',
    characteristics: ['Confident', 'Technical depth', 'Problem solver', 'Team player'],
    systemPrompt: `You are Sarah Johnson, a mid-level backend developer candidate being interviewed for a Software Developer position.

You have:
- 4 years of experience with Node.js, Python, and databases
- Strong experience with REST APIs and microservices
- Worked in 2 companies, currently employed
- BS in Software Engineering
- Experience with MongoDB, PostgreSQL, AWS

Personality:
- Confident but not arrogant
- Provide technical details when relevant
- Ask about team structure and technologies
- Show interest in growth opportunities
- Professional and articulate

Keep responses natural and conversational, around 80-120 words. Show the confidence of someone with solid experience.`,
  },
  'senior-full-stack-engineer': {
    name: 'Michael Chen',
    role: 'Senior Full-Stack Engineer',
    experience: '8 years',
    description: 'Senior engineer with 8 years across frontend and backend',
    characteristics: ['Highly experienced', 'Leadership potential', 'Strategic thinker', 'Mentorship'],
    systemPrompt: `You are Michael Chen, a senior full-stack engineer candidate being interviewed for a Software Developer position.

You have:
- 8 years of experience across full-stack development
- Led teams of 5-8 developers
- Expert in React, Node.js, TypeScript, cloud architecture
- Experience scaling applications to millions of users
- MS in Computer Science from top university

Personality:
- Very confident and articulate
- Ask strategic questions about company vision and tech stack
- Mention leadership and mentorship experience
- Discuss architectural decisions and trade-offs
- Professional with a slight air of authority

Keep responses thoughtful and detailed, around 100-150 words. Show the depth and perspective of a senior engineer.`,
  },
};

/**
 * Generate LiveKit connection details (matching agent-starter-react-main pattern)
 * POST /api/mock-interview/connection-details
 */
export const getConnectionDetails = async (req, res) => {
  try {
    const API_KEY = process.env.LIVEKIT_API_KEY;
    const API_SECRET = process.env.LIVEKIT_API_SECRET;
    const LIVEKIT_URL = process.env.LIVEKIT_URL;

    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    // Parse agent configuration from request body
    const body = req.body;
    let agentName = body?.room_config?.agents?.[0]?.agent_name;

    // Generate participant token
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      agentName,
      API_KEY,
      API_SECRET
    );

    // Return connection details
    const data = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken: participantToken,
      participantName,
    };

    res.json(data);
  } catch (error) {
    console.error('Generate connection details error:', error);
    res.status(500).json(error.message || 'Server error');
  }
};

/**
 * Helper function to create participant token (matching agent-starter pattern)
 */
async function createParticipantToken(
  userInfo,
  roomName,
  agentName,
  API_KEY,
  API_SECRET
) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  
  const grant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  
  at.addGrant(grant);

  // If agentName is not provided in body, check environment
  if (!agentName) {
    agentName = process.env.LIVEKIT_AGENT_NAME || 'Drew_2a0';
  }

  if (agentName) {
    at.roomConfig = new RoomConfiguration({
      agents: [{ agentName }],
    });
  }

  return at.toJwt();
}

/**
 * Generate LiveKit access token (legacy endpoint - kept for backward compatibility)
 * POST /api/mock-interview/token
 */
export const getLiveKitToken = async (req, res) => {
  try {
    const { roomName, participantName } = req.body;

    if (!roomName || !participantName) {
      return res.status(400).json({ message: 'roomName and participantName are required' });
    }

    // Get LiveKit credentials from environment
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('❌ LiveKit credentials not configured');
      return res.status(500).json({ 
        message: 'LiveKit not configured. Please set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env' 
      });
    }

    // Get agent name from environment variable, fallback to default
    const agentName = process.env.LIVEKIT_AGENT_NAME || 'Drew_2a0';

    const participantToken = await createParticipantToken(
      { identity: participantName, name: participantName },
      roomName,
      agentName,
      apiKey,
      apiSecret
    );
    
    console.log('✅ Generated LiveKit token for:', participantName);
    console.log('🤖 Agent for dispatch (roomConfig.agents[0].agentName):', agentName);

    // Ensure room exists; agent dispatch is handled by LiveKit based on roomConfig
    dispatchAgentToRoom(roomName).catch(err => {
      console.error('⚠️ Room ensure failed (non-fatal):', err.message);
    });

    res.json({
      token: String(participantToken), // Ensure it's always a string
      roomName,
      participantName,
      agentName,
    });
  } catch (error) {
    console.error('Generate LiveKit token error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get available personas
 * GET /api/personas
 */
export const getPersonas = async (req, res) => {
  try {
    const personas = Object.entries(PERSONAS).map(([key, persona]) => ({
      key,
      name: persona.name,
      role: persona.role,
      experience: persona.experience,
      description: persona.description,
      characteristics: persona.characteristics,
    }));

    res.json(personas);
  } catch (error) {
    console.error('Get personas error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Start interview session
 * POST /api/interview/start
 */
export const startInterview = async (req, res) => {
  try {
    const { roomName, personaKey = 'junior-frontend-developer' } = req.body;

    if (!roomName) {
      return res.status(400).json({ message: 'roomName is required' });
    }

    const persona = PERSONAS[personaKey];
    if (!persona) {
      return res.status(400).json({ message: 'Invalid persona key' });
    }

    // Initialize interview session
    const interview = {
      roomName,
      personaKey,
      persona,
      transcript: [],
      audioResponses: {},
      startedAt: new Date().toISOString(),
    };

    activeInterviews.set(roomName, interview);

    // Dispatch agent to room (if using explicit dispatch)
    try {
      await dispatchAgentToRoom(roomName);
      console.log('✅ Agent dispatched to room:', roomName);
    } catch (agentError) {
      console.warn('⚠️ Could not dispatch agent (may be using automatic dispatch):', agentError.message);
      // Don't fail the interview start if agent dispatch fails
      // Agent might join automatically or be manually configured
    }

    res.json({
      success: true,
      room: roomName,
      persona: {
        key: personaKey,
        name: persona.name,
        role: persona.role,
        experience: persona.experience,
      },
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get interview status and transcript
 * GET /api/interview/:roomName
 */
export const getInterview = async (req, res) => {
  try {
    const { roomName } = req.params;

    const interview = activeInterviews.get(roomName);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    res.json({
      transcript: interview.transcript,
      persona: {
        key: interview.personaKey,
        name: interview.persona.name,
        role: interview.persona.role,
      },
      startedAt: interview.startedAt,
    });
  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Ask question (text mode)
 * POST /api/interview/:roomName/ask
 */
export const askQuestion = async (req, res) => {
  try {
    const { roomName } = req.params;
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ message: 'question is required' });
    }

    const interview = activeInterviews.get(roomName);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        message: 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env' 
      });
    }

    // Add HR question to transcript
    interview.transcript.push({
      speaker: 'HR',
      text: question,
      timestamp: new Date().toISOString(),
    });

    // Generate candidate response using GPT-4
    const messages = [
      { role: 'system', content: interview.persona.systemPrompt },
      ...interview.transcript.slice(-10).map(entry => ({
        role: entry.speaker === 'HR' ? 'user' : 'assistant',
        content: entry.text,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.8,
      max_tokens: 200,
    });

    const response = completion.choices[0].message.content.trim();

    // Add candidate response to transcript
    interview.transcript.push({
      speaker: 'Candidate',
      text: response,
      timestamp: new Date().toISOString(),
    });

    // Generate TTS audio
    const audioId = `audio-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: response,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    interview.audioResponses[audioId] = buffer;

    res.json({
      response,
      audioId,
      transcript: interview.transcript,
    });
  } catch (error) {
    console.error('Ask question error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Process audio chunk (voice mode)
 * POST /api/interview/:roomName/audio
 */
export const processAudioChunk = async (req, res) => {
  try {
    const { roomName } = req.params;

    const interview = activeInterviews.get(roomName);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        message: 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Audio file is required' });
    }

    console.log('📝 Processing audio file:', req.file.path, 'Size:', req.file.size);

    let hrQuestion = '';
    
    try {
      // Speech-to-Text using Whisper
      // OpenAI's Whisper API is very picky about WebM files
      // Try multiple approaches as fallback
      const audioBuffer = fs.readFileSync(req.file.path);
      
      let transcription = null;
      let lastError = null;
      
      // Attempt 1: Try as OGG (WebM is usually Opus codec in OGG container)
      try {
        console.log('🔄 Attempt 1: Trying as OGG format...');
        transcription = await openai.audio.transcriptions.create({
          file: await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' }),
          model: 'whisper-1',
          language: 'en',
        });
      } catch (err) {
        console.log('❌ OGG format failed, trying WebM...');
        lastError = err;
        
        // Attempt 2: Try as WebM
        try {
          console.log('🔄 Attempt 2: Trying as WebM format...');
          transcription = await openai.audio.transcriptions.create({
            file: await toFile(audioBuffer, 'audio.webm', { type: 'audio/webm' }),
            model: 'whisper-1',
            language: 'en',
          });
        } catch (err2) {
          console.log('❌ WebM format failed, trying generic...');
          lastError = err2;
          
          // Attempt 3: Try as MP3 (Desperate measure - sometimes tricks the decoder)
          try {
            console.log('🔄 Attempt 3: Trying as MP3 format (fallback)...');
            transcription = await openai.audio.transcriptions.create({
              file: await toFile(audioBuffer, 'audio.mp3', { type: 'audio/mpeg' }),
              model: 'whisper-1',
              language: 'en',
            });
          } catch (err3) {
             console.log('❌ MP3 format failed, trying WAV...');
             lastError = err3;
             
             // Attempt 4: Try as WAV
             try {
                console.log('🔄 Attempt 4: Trying as WAV format...');
                transcription = await openai.audio.transcriptions.create({
                  file: await toFile(audioBuffer, 'audio.wav', { type: 'audio/wav' }),
                  model: 'whisper-1',
                  language: 'en',
                });
             } catch (err4) {
                lastError = err4;
                throw err4;
             }
          }
        }
      }

      if (transcription) {
        hrQuestion = transcription.text.trim();
        console.log('✅ Transcription successful:', hrQuestion);
      }
    } catch (whisperError) {
      console.error('❌ All Whisper API attempts failed:', whisperError);
      console.error('File path:', req.file.path);
      console.error('File size:', req.file.size);
      console.error('File mimetype:', req.file.mimetype);
      
      // Clean up file before throwing
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      // Provide a more helpful error message
      if (whisperError.message && whisperError.message.includes('Invalid file format')) {
        throw new Error('Audio format not compatible with Whisper API. Try using Text Mode instead.');
      }
      throw new Error(`Speech-to-text failed after multiple attempts: ${whisperError.message}`);
    }

    // Clean up uploaded file
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupErr) {
      console.log('⚠️  File cleanup warning:', cleanupErr.message);
    }

    if (!hrQuestion || hrQuestion.length < 3) {
      console.log('⚠️ Audio too short or unclear');
      return res.json({
        transcript: '',
        response: '',
        audioId: null,
        message: 'Audio too short or unclear',
      });
    }

    // Add HR question to transcript
    interview.transcript.push({
      speaker: 'HR',
      text: hrQuestion,
      timestamp: new Date().toISOString(),
    });

    // Generate candidate response using GPT-4
    const messages = [
      { role: 'system', content: interview.persona.systemPrompt },
      ...interview.transcript.slice(-10).map(entry => ({
        role: entry.speaker === 'HR' ? 'user' : 'assistant',
        content: entry.text,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.8,
      max_tokens: 200,
    });

    const response = completion.choices[0].message.content.trim();

    // Add candidate response to transcript
    interview.transcript.push({
      speaker: 'Candidate',
      text: response,
      timestamp: new Date().toISOString(),
    });

    // Generate TTS audio
    const audioId = `audio-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: response,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    interview.audioResponses[audioId] = buffer;

    res.json({
      transcript: hrQuestion,
      response,
      audioId,
    });
  } catch (error) {
    console.error('❌ Process audio error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      file: req.file ? req.file.path : 'no file',
    });
    
    // Clean up file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to cleanup file:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
};

/**
 * Get audio response
 * GET /api/interview/:roomName/audio/:audioId
 */
export const getAudioResponse = async (req, res) => {
  try {
    const { roomName, audioId } = req.params;

    const interview = activeInterviews.get(roomName);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    const audioBuffer = interview.audioResponses[audioId];
    if (!audioBuffer) {
      return res.status(404).json({ message: 'Audio not found' });
    }

    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (error) {
    console.error('Get audio response error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * End interview and generate evaluation
 * POST /api/interview/:roomName/end
 */
export const endInterview = async (req, res) => {
  try {
    const { roomName } = req.params;

    const interview = activeInterviews.get(roomName);
    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        message: 'OpenAI API key not configured. Please set OPENAI_API_KEY in .env' 
      });
    }

    // Format transcript for evaluation
    const transcriptText = interview.transcript
      .map(entry => `${entry.speaker}: ${entry.text}`)
      .join('\n\n');

    // Generate evaluation using GPT-4
    const evaluationPrompt = `You are an expert HR interviewer evaluator. Analyze this interview transcript and provide a detailed evaluation of the interviewer's performance (not the candidate).

Interview Transcript:
${transcriptText}

Evaluate the HR interviewer on these criteria:
1. Question quality and structure
2. Active listening skills
3. Rapport building
4. Follow-up questions
5. Professionalism
6. Time management
7. Overall effectiveness

Provide your evaluation in this exact JSON format:
{
  "score": <number 0-10>,
  "strengths": [<array of 3-5 specific strengths>],
  "weaknesses": [<array of 2-4 areas needing improvement>],
  "suggestions": [<array of 3-5 actionable suggestions>],
  "keyMoments": [<array of 2-3 notable interview moments>]
}

Be constructive, specific, and professional.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an expert HR interview evaluator. Respond only with valid JSON.' },
        { role: 'user', content: evaluationPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    let evaluation;
    try {
      const responseText = completion.choices[0].message.content.trim();
      // Remove markdown code blocks if present
      const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      evaluation = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse evaluation JSON:', parseError);
      // Fallback evaluation
      evaluation = {
        score: 7,
        strengths: [
          'Conducted structured interview',
          'Asked relevant questions',
          'Maintained professional demeanor',
        ],
        weaknesses: [
          'Could improve follow-up questions',
          'Limited rapport building',
        ],
        suggestions: [
          'Ask more behavioral questions',
          'Practice active listening techniques',
          'Build better rapport with candidates',
        ],
        keyMoments: [
          'Good opening introduction',
          'Effective closing summary',
        ],
      };
    }

    interview.evaluation = evaluation;
    interview.endedAt = new Date().toISOString();

    res.json({
      success: true,
      interview: {
        roomName,
        transcript: interview.transcript,
        evaluation,
        startedAt: interview.startedAt,
        endedAt: interview.endedAt,
      },
    });

    // Optional: Clean up interview after some time (e.g., 1 hour)
    setTimeout(() => {
      activeInterviews.delete(roomName);
    }, 3600000); // 1 hour
  } catch (error) {
    console.error('End interview error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

