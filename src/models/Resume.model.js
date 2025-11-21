import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema({
  simulationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimulationSession',
    required: false, // Optional - shared resumes don't have simulationId
  },
  isShared: {
    type: Boolean,
    default: false, // True for shared resumes used by all users
  },
  candidateName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
  },
  experience: {
    type: Number, // years
  },
  skills: [{
    type: String,
  }],
  education: {
    type: String,
  },
  summary: {
    type: String,
  },
  workHistory: [{
    company: String,
    position: String,
    duration: String,
    description: String,
  }],
  quality: {
    type: String,
    enum: ['excellent', 'good', 'average', 'poor'],
    required: true,
  },
  relevance: {
    type: Number,
    min: 1,
    max: 10,
    required: true,
  },
  resumeText: {
    type: String,
    required: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Index for faster queries
resumeSchema.index({ simulationId: 1 });
resumeSchema.index({ simulationId: 1, quality: 1 });
resumeSchema.index({ isShared: 1 });

const Resume = mongoose.model('Resume', resumeSchema);

export default Resume;

