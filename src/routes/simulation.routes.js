import express from 'express';
import * as simulationController from '../controllers/simulation.controller.js';

const router = express.Router();

// Note: Authentication is handled inside the controller for flexibility
// This allows simulation to work without auth for development
// In production, add authentication middleware here

// Routes
router.post('/start', simulationController.startSimulation);
router.get('/:id', simulationController.getSimulation);
router.get('/:id/final-report', simulationController.generateFinalReport);
router.post('/:id/end', simulationController.endSimulation);

export default router;

