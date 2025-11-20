import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB Connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.error('⚠️  Server will continue but database operations will fail.');
    console.error('💡 Please check your MONGODB_URI in .env file');
    mongoose.connection.readyState = 0;
  }
};

// Helper to check if MongoDB is connected
export const isMongoConnected = () => {
  return mongoose.connection.readyState === 1;
};

export default connectDB;

