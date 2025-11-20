import express from 'express';
import * as uploadController from '../controllers/upload.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes
router.post('/file', uploadController.upload.single('file'), uploadController.uploadFile);
router.post('/audio', uploadController.upload.single('audio'), uploadController.uploadAudio);

export default router;

