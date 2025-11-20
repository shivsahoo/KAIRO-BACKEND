import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import { HR_TASKS } from '../services/task.service.js';

dotenv.config();

/**
 * Seed script for HR tasks
 * Note: Tasks are already defined in task.service.js, but this can be used
 * to seed any additional data if needed
 */
async function seed() {
  try {
    console.log('🌱 Starting seed process...');
    
    // Connect to database
    await connectDB();
    
    console.log('✅ Database connected');
    console.log(`📋 HR Tasks defined: ${HR_TASKS.length} tasks`);
    
    HR_TASKS.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.title} (${task.level})`);
    });
    
    console.log('\n✅ Seed process completed!');
    console.log('💡 Tasks are loaded from task.service.js when needed.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seed();

