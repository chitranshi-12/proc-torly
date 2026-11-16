import mongoose from 'mongoose';
import { ENV } from './env.js';

// Disable Mongoose command buffering so operations fail fast or fall back instead of hanging for 10s
mongoose.set('bufferCommands', false);

let isConnected = false;

export async function connectDB(): Promise<typeof mongoose | null> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (ENV.isProd && (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('127.0.0.1') || process.env.MONGODB_URI.includes('localhost'))) {
    throw new Error('FATAL: MONGODB_URI environment variable is required and must point to MongoDB Atlas in production mode.');
  }

  const uri = ENV.MONGODB_URI;
  console.log(`📡 Connecting to MongoDB (${ENV.DB_NAME})...`);

  try {
    await mongoose.connect(uri, {
      dbName: ENV.DB_NAME,
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log(`✅ MongoDB connected successfully to database "${ENV.DB_NAME}"`);

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB runtime error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB connection lost. Reconnecting...');
      isConnected = false;
    });

    return mongoose;
  } catch (err: any) {
    console.error('⚠️ MongoDB connection attempt failed:', err.message);
    if (ENV.isProd) {
      throw err;
    }
    console.warn('⚠️ Running in development without persistent MongoDB or waiting for MongoDB service.');
    return null;
  }
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
