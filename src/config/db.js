import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDatabase = async (uri = env.mongoUri) => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
};

export const disconnectDatabase = () => mongoose.disconnect();
