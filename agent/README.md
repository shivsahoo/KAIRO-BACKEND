# LiveKit Agent for HR Interview Simulation

This is the Python agent that joins LiveKit rooms to conduct mock HR interviews.

## Setup

1. **Activate the virtual environment:**
   ```bash
   cd /home/chakit/Hackathon/KAIRO/KAIRO-BACKEND/agent
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set environment variables:**
   ```bash
   export LIVEKIT_URL=wss://kairo-imiootqz.livekit.cloud
   export LIVEKIT_API_KEY=your_api_key
   export LIVEKIT_API_SECRET=your_api_secret
   export LIVEKIT_AGENT_NAME=Drew_2a0  # Must match backend .env
   export OPENAI_API_KEY=your_openai_key
   ```

4. **Run the agent locally (for testing):**
   ```bash
   python main.py dev
   ```

## Deploying to LiveKit Cloud

1. Go to https://cloud.livekit.io
2. Navigate to **Agents** → **Create Agent** or **Deploy**
3. Upload this agent code or connect your repository
4. Set the agent name to match `LIVEKIT_AGENT_NAME` in your backend `.env` file
5. Configure environment variables:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `LIVEKIT_AGENT_NAME` (must match backend)
   - `OPENAI_API_KEY`
6. Deploy and ensure status is "Running"

## Agent Name

**CRITICAL:** The agent name in `main.py` (from `LIVEKIT_AGENT_NAME` env var) must **exactly match** the `LIVEKIT_AGENT_NAME` in your backend `.env` file.

Example:
- Backend `.env`: `LIVEKIT_AGENT_NAME=Drew_2a0`
- Agent code: Uses `AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "Drew_2a0")`
- LiveKit Cloud: Agent name should be `Drew_2a0`

## How It Works

1. Backend generates token with `roomConfig.agents[0].agentName = "Drew_2a0"`
2. Frontend joins room with this token
3. LiveKit Cloud dispatches the agent to the room
4. Agent connects and starts the voice assistant
5. Agent listens to user audio, processes with OpenAI, and responds

## Troubleshooting

- **Agent not joining:** Check that agent name matches exactly in backend, agent code, and LiveKit Cloud
- **Agent not responding:** Check `OPENAI_API_KEY` is set correctly
- **Connection errors:** Verify `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are correct

