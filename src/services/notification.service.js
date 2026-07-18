import { Notification } from '../models/index.js';

export const createNotification = async (payload, io) => {
  const notification = await Notification.create(payload);
  io?.to(`user:${payload.userId}`).emit('notification:new', notification);
  return notification;
};
