import mongoose from 'mongoose';

const taskSubmissionSchema = new mongoose.Schema({
  simulationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimulationSession',
    required: true,
  },
  taskId: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
  },
  files: [{
    type: String, // URLs
  }],
  audioUrl: {
    type: String,
  },
  selectedResumes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
  }],
  resumeRatings: [{
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
    },
    rating: {
      type: Number,
      min: 1,
      max: 10,
    },
    notes: String,
  }],
  // For hr_t3: interview schedules and emails
  interviewIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InterviewSchedule',
  }],
  emailIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Email',
  }],
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  score: {
    type: Number,
    min: 0,
    max: 10,
  },
  feedback: {
    type: String,
  },
  improvements: [{
    type: String,
  }],
}, {
  timestamps: true,
});

// Index for faster queries
taskSubmissionSchema.index({ simulationId: 1, taskId: 1 });
taskSubmissionSchema.index({ userId: 1 });

const TaskSubmission = mongoose.model('TaskSubmission', taskSubmissionSchema);

export default TaskSubmission;

