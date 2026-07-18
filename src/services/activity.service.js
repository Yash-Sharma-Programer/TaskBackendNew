import { Activity } from '../models/index.js';

export const recordActivity = (payload) => Activity.create(payload);
