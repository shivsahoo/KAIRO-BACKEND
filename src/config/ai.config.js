import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

let aiClient = null;
const provider = process.env.AI_PROVIDER || 'openai';

if (provider === 'openai' && process.env.OPENAI_API_KEY) {
  aiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('✅ OpenAI client initialized');
} else if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
  aiClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log('✅ Anthropic client initialized');
} else {
  console.warn('⚠️  No AI provider configured - using mock responses');
}

export { aiClient, provider };

