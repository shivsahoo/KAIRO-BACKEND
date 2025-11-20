import SimulationSession from '../models/SimulationSession.model.js';
import TaskSubmission from '../models/TaskSubmission.model.js';
import Message from '../models/Message.model.js';
import { getCurrentTask, getAllTasks, taskExists, getNextTaskIndex, getTaskById } from '../services/task.service.js';
import { evaluateTask } from '../services/ai.orchestrator.js';
import { getSocketInstance } from '../utils/socket.instance.js';

/**
 * Get current task
 */
export const getCurrentTaskHandler = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    const currentTask = getCurrentTask(session.currentTaskIndex);

    if (!currentTask) {
      return res.json({ 
        message: 'All tasks completed',
        task: null,
      });
    }

    res.json({
      task: {
        id: currentTask.id,
        title: currentTask.title,
        description: currentTask.description,
        level: currentTask.level,
        expectedOutput: currentTask.expectedOutput,
        status: 'pending',
      },
      taskIndex: session.currentTaskIndex,
    });
  } catch (error) {
    console.error('Get current task error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Submit task
 */
export const submitTask = async (req, res) => {
  try {
    const userId = req.user.id;
    const { text, files, audioUrl } = req.body;

    // Find active simulation session
    const session = await SimulationSession.findOne({
      userId,
      status: 'active',
    });

    if (!session) {
      return res.status(404).json({ message: 'No active simulation session' });
    }

    const currentTask = getCurrentTask(session.currentTaskIndex);

    if (!currentTask) {
      return res.status(400).json({ message: 'No current task to submit' });
    }

    // Create task submission
    const submission = await TaskSubmission.create({
      simulationId: session._id,
      taskId: currentTask.id,
      userId,
      text,
      files: files || [],
      audioUrl,
    });

    // Get task details for evaluation
    const taskDetails = {
      id: currentTask.id,
      title: currentTask.title,
      description: currentTask.description,
      expectedOutput: currentTask.expectedOutput,
    };

    // Evaluate submission using AI
    const evaluation = await evaluateTask(currentTask.id, submission, taskDetails);

    // Update submission with evaluation
    submission.score = evaluation.score;
    submission.feedback = evaluation.feedback;
    submission.improvements = evaluation.improvements;
    await submission.save();

    // Update timeline
    session.timeline.push({
      type: 'task_submitted',
      taskId: currentTask.id,
      timestamp: new Date(),
      meta: { submissionId: submission._id },
    });

    session.timeline.push({
      type: 'scored',
      taskId: currentTask.id,
      timestamp: new Date(),
      meta: { score: evaluation.score, feedback: evaluation.feedback },
    });

    // Move to next task
    const nextTaskIndex = getNextTaskIndex(session.currentTaskIndex);
    session.currentTaskIndex = nextTaskIndex;

    // If there's a next task, assign it
    const nextTask = getCurrentTask(nextTaskIndex);
    if (nextTask) {
      session.timeline.push({
        type: 'task_assigned',
        taskId: nextTask.id,
        timestamp: new Date(),
        meta: { task: nextTask },
      });

      // Send task assigned message via socket
      const io = getSocketInstance();
      if (io) {
        io.to(session._id.toString()).emit('task_assigned', {
        task: {
          id: nextTask.id,
          title: nextTask.title,
          description: nextTask.description,
          level: nextTask.level,
          expectedOutput: nextTask.expectedOutput,
          status: 'pending',
        },
        });
        }
      }

    await session.save();

    // Emit task scored event via socket
    const io = getSocketInstance();
    if (io) {
      io.to(session._id.toString()).emit('task_scored', {
      taskId: currentTask.id,
      score: evaluation.score,
      feedback: evaluation.feedback,
      improvements: evaluation.improvements,
      });
    }

    res.status(201).json({
      submission: {
        id: submission._id,
        taskId: currentTask.id,
        score: evaluation.score,
        feedback: evaluation.feedback,
        improvements: evaluation.improvements,
      },
      nextTask: nextTask ? {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
        level: nextTask.level,
        expectedOutput: nextTask.expectedOutput,
        status: 'pending',
      } : null,
      completed: !nextTask,
    });
  } catch (error) {
    console.error('Submit task error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all tasks
 */
export const getAllTasksHandler = async (req, res) => {
  try {
    const tasks = getAllTasks();

    res.json({
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        level: task.level,
        expectedOutput: task.expectedOutput,
      })),
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

