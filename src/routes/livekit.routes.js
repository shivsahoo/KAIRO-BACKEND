import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

router.post('/connection-details', authenticate, async (req, res) => {
  try {
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(500).json({ 
        error: 'LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in your .env file' 
      });
    }

    const { room_config } = req.body;
    const agentName = room_config?.agents?.[0]?.agent_name || 'Drew_2a0';

    const userId = req.user.id;
    const participantName = req.user.name || 'user';
    const participantIdentity = `interview_user_${userId}_${Date.now()}`;
    const roomName = `interview_room_${userId}_${Date.now()}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName,
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

    if (agentName) {
      at.roomConfig = new RoomConfiguration({
        agents: [{ agentName }],
      });
    }

    const participantToken = await at.toJwt();

    res.json({
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken,
      participantName,
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    res.status(500).json({ error: error.message || 'Failed to generate connection details' });
  }
});

export default router;

