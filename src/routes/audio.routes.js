import express from 'express';
import * as audioController from '../controllers/audio.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes
router.post('/stt', audioController.speechToText);
router.post('/tts', audioController.textToSpeech);

export default router;

