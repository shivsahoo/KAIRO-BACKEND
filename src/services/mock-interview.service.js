import OpenAI, { toFile } from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const activeInterviews = new Map();

export const getActiveInterviews = () => activeInterviews;

export const processAudioBuffer = async (roomName, audioBuffer) => {
  const interview = activeInterviews.get(roomName);
  if (!interview) {
    throw new Error('Interview not found');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  let hrQuestion = '';
  
  // Attempt 1: Try as OGG
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' }),
      model: 'whisper-1',
      language: 'en',
    });
    hrQuestion = transcription.text.trim();
  } catch (err) {
    console.log('❌ OGG failed, trying WebM...');
    // Attempt 2: Try as WebM
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: await toFile(audioBuffer, 'audio.webm', { type: 'audio/webm' }),
        model: 'whisper-1',
        language: 'en',
      });
      hrQuestion = transcription.text.trim();
    } catch (err2) {
       console.log('❌ WebM failed, trying WAV...');
       // Attempt 3: WAV
       const transcription = await openai.audio.transcriptions.create({
         file: await toFile(audioBuffer, 'audio.wav', { type: 'audio/wav' }),
         model: 'whisper-1',
         language: 'en',
       });
       hrQuestion = transcription.text.trim();
    }
  }

  if (!hrQuestion || hrQuestion.length < 2) {
    return { transcript: '', response: '', audioId: null };
  }

  // Add HR question to transcript
  interview.transcript.push({
    speaker: 'HR',
    text: hrQuestion,
    timestamp: new Date().toISOString(),
  });

  // Generate response
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

  const aiResponse = completion.choices[0].message.content.trim();

  // Add Candidate response
  interview.transcript.push({
    speaker: 'Candidate',
    text: aiResponse,
    timestamp: new Date().toISOString(),
  });

  // TTS
  const audioId = `audio-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const mp3 = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: aiResponse,
  });

  const responseBuffer = Buffer.from(await mp3.arrayBuffer());
  interview.audioResponses[audioId] = responseBuffer;

  return {
    transcript: hrQuestion,
    response: aiResponse,
    audioId,
  };
};

