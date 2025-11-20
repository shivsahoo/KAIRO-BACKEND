import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  simulationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimulationSession',
    required: true,
  },
  sender: {
    type: String,
    enum: ['user', 'manager', 'candidate', 'team', 'system'],
    required: true,
  },
  persona: {
    type: String,
    enum: ['Manager', 'Team', 'General', 'Candidate', null],
    default: null,
  },
  text: {
    type: String,
    required: true,
  },
  audioUrl: {
    type: String,
  },
  fileUrl: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Index for faster queries
messageSchema.index({ simulationId: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;

