import mongoose from 'mongoose';

const timelineEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'task_assigned',
      'message',
      'task_submitted',
      'scored',
      'session_started',
      'session_ended',
    ],
    required: true,
  },
  taskId: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
  },
}, { _id: false });

const simulationSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: ['HR Executive', 'Business Analyst'],
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'ended'],
    default: 'active',
  },
  currentTaskIndex: {
    type: Number,
    default: 0,
  },
  timeline: [timelineEventSchema],
  startedAt: {
    type: Date,
    default: Date.now,
  },
  endedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Index for faster queries
simulationSessionSchema.index({ userId: 1, status: 1 });

const SimulationSession = mongoose.model('SimulationSession', simulationSessionSchema);

export default SimulationSession;

