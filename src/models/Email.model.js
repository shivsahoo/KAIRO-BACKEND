import mongoose from 'mongoose';

const emailSchema = new mongoose.Schema({
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
  // Email metadata
  type: {
    type: String,
    enum: ['sent', 'received'],
    required: true,
  },
  folder: {
    type: String,
    enum: ['inbox', 'sent', 'drafts', 'trash'],
    default: 'inbox',
  },
  // Sender/Recipient
  from: {
    name: String,
    email: String,
  },
  to: [{
    name: String,
    email: String,
  }],
  cc: [{
    name: String,
    email: String,
  }],
  bcc: [{
    name: String,
    email: String,
  }],
  // Email content
  subject: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  bodyHtml: {
    type: String, // HTML version if needed
  },
  // Attachments
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    mimeType: String,
  }],
  // For hr_t3 - link to candidate and interview
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
  },
  candidateName: {
    type: String,
  },
  interviewScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InterviewSchedule',
  },
  // Email status
  read: {
    type: Boolean,
    default: false,
  },
  starred: {
    type: Boolean,
    default: false,
  },
  important: {
    type: Boolean,
    default: false,
  },
  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now,
  },
  receivedAt: {
    type: Date,
    default: Date.now,
  },
  readAt: {
    type: Date,
  },
  // For responses (threading)
  inReplyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Email',
  },
  threadId: {
    type: String, // For grouping emails in a conversation
  },
}, {
  timestamps: true,
});

// Index for faster queries
emailSchema.index({ simulationId: 1, taskId: 1 });
emailSchema.index({ userId: 1 });
emailSchema.index({ folder: 1, sentAt: -1 });
emailSchema.index({ type: 1 });
emailSchema.index({ candidateId: 1 });
emailSchema.index({ interviewScheduleId: 1 });
emailSchema.index({ threadId: 1 });

const Email = mongoose.model('Email', emailSchema);

export default Email;

