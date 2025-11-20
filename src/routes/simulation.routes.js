import express from 'express';
import * as simulationController from '../controllers/simulation.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes
router.post('/start', simulationController.startSimulation);
router.get('/:id', simulationController.getSimulation);
router.get('/:id/final-report', simulationController.generateFinalReport);
router.post('/:id/end', simulationController.endSimulation);

export default router;

