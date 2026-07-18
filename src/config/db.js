import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDatabase = async (uri = env.mongoUri) => {
  mongoose.set('strictQuery', true);
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoose.connection.readyState === 2) return mongoose.connection.asPromise();
  await mongoose.connect(uri);
  return mongoose.connection;
};

export const disconnectDatabase = () => mongoose.disconnect();
