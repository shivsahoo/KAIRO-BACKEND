import express from 'express';
import * as taskController from '../controllers/task.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes
router.get('/current', taskController.getCurrentTaskHandler);
router.post('/submit', taskController.submitTask);
router.post('/resubmit/:taskId', taskController.resubmitTask);
router.get('/all', taskController.getAllTasksHandler);

export default router;

