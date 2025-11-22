import express from 'express';
import * as interviewController from '../controllers/interview.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes
router.get('/candidates', interviewController.getCandidates);
router.get('/time-slots', interviewController.getAvailableTimeSlots);
router.get('/interviews', interviewController.getInterviews);
router.post('/schedule', interviewController.createInterviewSchedule);
router.post('/send-email', interviewController.sendInterviewEmail);
router.get('/inbox', interviewController.getInbox);
// Transcript routes
router.post('/transcript', interviewController.saveTranscript);
router.get('/transcripts', interviewController.getTranscripts);
router.get('/transcript/:id', interviewController.getTranscript);
// Candidate confirmation response removed - no conflicts needed

export default router;

