import mongoose from 'mongoose';

const interviewScheduleSchema = new mongoose.Schema({
  simulationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimulationSession',
    required: true,
  },
  taskId: {
    type: String,
    required: true,
    default: 'hr_t3',
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
    required: true,
  },
  resumeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
    // Optional: Resume to attach in emails (defaults to candidateId if not provided)
  },
  candidateName: {
    type: String,
    required: true,
  },
  candidateEmail: {
    type: String,
    required: true,
  },
  interviewerName: {
    type: String,
    default: 'Sarah Chen (HR Manager)',
  },
  interviewType: {
    type: String,
    enum: ['phone', 'video', 'in-person'],
    default: 'video',
  },
  title: {
    type: String,
    required: true,
    default: 'Interview - Python Developer Position',
  },
  description: {
    type: String,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  duration: {
    type: Number, // in minutes
    default: 60,
  },
  location: {
    type: String, // For in-person interviews or video link
  },
  meetingLink: {
    type: String, // For video interviews - REQUIRED for evaluation
    required: true,
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'declined', 'rescheduled', 'cancelled'],
    default: 'scheduled',
  },
  // Candidate confirmation removed - no conflicts needed
  emailSent: {
    type: Boolean,
    default: false,
  },
  emailId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Email',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Index for faster queries
interviewScheduleSchema.index({ simulationId: 1, taskId: 1 });
interviewScheduleSchema.index({ userId: 1 });
interviewScheduleSchema.index({ candidateId: 1 });
interviewScheduleSchema.index({ startTime: 1 });

const InterviewSchedule = mongoose.model('InterviewSchedule', interviewScheduleSchema);

export default InterviewSchedule;

