import express from 'express';
import multer from 'multer';
import * as mockInterviewController from '../controllers/mock-interview.controller.js';

const router = express.Router();

// Ensure uploads directory exists
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    // Preserve the original extension or use .webm as default
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `audio-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// Public routes (no authentication required for hackathon)
// In production, add authentication middleware

// LiveKit connection details (matching agent-starter pattern)
router.post('/connection-details', mockInterviewController.getConnectionDetails);

// LiveKit token generation (legacy endpoint - kept for backward compatibility)
router.post('/token', mockInterviewController.getLiveKitToken);

// Personas
router.get('/personas', mockInterviewController.getPersonas);

// Interview session management
router.post('/interview/start', mockInterviewController.startInterview);
router.get('/interview/:roomName', mockInterviewController.getInterview);
router.post('/interview/:roomName/ask', mockInterviewController.askQuestion);
router.post('/interview/:roomName/audio', upload.single('audio'), mockInterviewController.processAudioChunk);
router.get('/interview/:roomName/audio/:audioId', mockInterviewController.getAudioResponse);
router.post('/interview/:roomName/end', mockInterviewController.endInterview);

export default router;

