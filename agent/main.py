"""
LiveKit Agent for HR Interview Simulation
This agent joins LiveKit rooms and conducts mock interviews with candidates.
"""

import asyncio
import os
from typing import Annotated

from livekit import agents, rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
    tts,
    vad,
    voice_assistant,
)
from livekit.plugins import openai, silero

# Get agent name from environment variable (must match LIVEKIT_AGENT_NAME in backend .env)
AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "Drew_2a0")

# Get OpenAI API key from environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is required")

# Initialize OpenAI client
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)


@agents.agent(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext):
    """Main entrypoint for the agent when dispatched to a room."""
    print(f"🤖 Agent {AGENT_NAME} joining room: {ctx.room.name}")
    
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    print(f"✅ Connected to room: {ctx.room.name}")

    # Get metadata from room config if available
    metadata = {}
    if ctx.job.metadata:
        try:
            import json
            metadata = json.loads(ctx.job.metadata)
            print(f"📝 Room metadata: {metadata}")
        except:
            pass

    # Initialize the voice assistant
    assistant = voice_assistant.VoiceAssistant(
        vad=vad.VAD.load(silero.VAD.load()),
        stt=openai.STT(),
        llm=openai.LLM(
            model="gpt-4o",
            instructions="""You are an HR interviewer conducting a mock interview with a candidate.
            
Your role:
- Ask relevant technical and behavioral questions
- Evaluate the candidate's communication skills
- Assess their technical knowledge
- Provide constructive feedback
- Keep the interview professional but friendly
- Ask follow-up questions based on their responses

Guidelines:
- Start with a warm greeting and introduction
- Ask 3-5 questions about their experience and skills
- Listen actively and ask follow-up questions
- End with asking if they have any questions
- Keep responses concise (2-3 sentences)

Be professional, engaging, and help the candidate feel comfortable.""",
        ),
        tts=openai.TTS(voice="alloy"),
    )

    # Start the assistant
    assistant.start(ctx.room)

    # Wait for the assistant to finish
    await assistant.aclose()
    print(f"👋 Agent {AGENT_NAME} leaving room: {ctx.room.name}")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

