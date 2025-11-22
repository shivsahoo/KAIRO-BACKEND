import mongoose from 'mongoose';

const transcriptEntrySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Number,
    required: true,
  },
  speaker: {
    type: String,
    enum: ['user', 'agent'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'audio'],
    default: 'text',
  },
}, { _id: false });

const interviewTranscriptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
  },
  roomName: {
    type: String,
  },
  agentName: {
    type: String,
    default: 'Drew_2a0',
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
    type: Number, // in milliseconds
    required: true,
  },
  transcript: {
    type: [transcriptEntrySchema],
    default: [],
  },
  // Evaluation fields
  evaluated: {
    type: Boolean,
    default: false,
  },
  evaluation: {
    score: Number,
    feedback: String,
    strengths: [String],
    improvements: [String],
    skills: [{
      name: String,
      level: Number,
    }],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes for faster queries
interviewTranscriptSchema.index({ userId: 1, createdAt: -1 });
interviewTranscriptSchema.index({ sessionId: 1 });
interviewTranscriptSchema.index({ agentName: 1 });

const InterviewTranscript = mongoose.model('InterviewTranscript', interviewTranscriptSchema);

export default InterviewTranscript;

