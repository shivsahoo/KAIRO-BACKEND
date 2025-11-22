import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './src/config/database.js';
import authRoutes from './src/routes/auth.routes.js';
import simulationRoutes from './src/routes/simulation.routes.js';
import taskRoutes from './src/routes/task.routes.js';
import uploadRoutes from './src/routes/upload.routes.js';
import audioRoutes from './src/routes/audio.routes.js';
import interviewRoutes from './src/routes/interview.routes.js';
import livekitRoutes from './src/routes/livekit.routes.js';
import { initializeSocket } from './src/sockets/socket.handler.js';
import { setSocketInstance } from './src/utils/socket.instance.js';
import { initializeSharedResumes } from './src/services/resume.service.js';
import mongoose from 'mongoose';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Connect to MongoDB
connectDB();

// Initialize shared resumes when MongoDB is connected
mongoose.connection.once('connected', async () => {
  try {
    await initializeSharedResumes();
  } catch (error) {
    console.error('Error initializing shared resumes:', error);
  }
});

// Middleware - CORS (Allow all origins)
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/livekit', livekitRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'KAIRO Backend is running' });
});

// Set socket instance for use in controllers
setSocketInstance(io);

// Initialize Socket.io
initializeSocket(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server initialized`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please stop the process using this port.`);
    console.error(`💡 Run: lsof -ti:${PORT} | xargs kill -9`);
    process.exit(1);
  } else {
    throw err;
  }
});

export { io };

