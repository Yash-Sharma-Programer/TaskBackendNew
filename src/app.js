import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { preventXss } from './middleware/xss.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import organisationRoutes from './routes/organisation.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import projectRoutes from './routes/project.routes.js';
import boardRoutes from './routes/board.routes.js';
import taskRoutes from './routes/task.routes.js';
import commentRoutes from './routes/comment.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import invitationRoutes from './routes/invitation.routes.js';
import fileRoutes from './routes/file.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import chatRoutes from './routes/chat.routes.js';

const corsOptions = {
  origin: (origin, callback) => {
    const normalizedOrigin = origin?.replace(/\/+$/, '');
    if (!normalizedOrigin || env.clientUrls.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organisation-Id'],
  optionsSuccessStatus: 204,
};

export const createApp = (io = null) => {
  const app = express(); app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsOptions));
  app.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: '1mb' })); app.use(express.urlencoded({ extended: true, limit: '1mb' })); app.use(cookieParser()); app.use(mongoSanitize()); app.use(preventXss);
  if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use('/uploads', express.static(path.resolve('uploads'), { maxAge: env.nodeEnv === 'production' ? '7d' : 0 }));
  app.locals.io = io;
  app.use((req, _res, next) => { req.io = app.locals.io; next(); });
  app.get('/api/v1/health', (_req, res) => res.json({ success: true, message: 'TaskFlow API is healthy', data: { timestamp: new Date().toISOString() } }));
  app.use('/api/v1/auth', authRoutes); app.use('/api/v1/users', userRoutes); app.use('/api/v1/organisations', organisationRoutes); app.use('/api/v1/workspaces', workspaceRoutes); app.use('/api/v1/projects', projectRoutes); app.use('/api/v1/boards', boardRoutes); app.use('/api/v1/tasks', taskRoutes); app.use('/api/v1/comments', commentRoutes); app.use('/api/v1/notifications', notificationRoutes); app.use('/api/v1/invitations', invitationRoutes); app.use('/api/v1/files', fileRoutes); app.use('/api/v1/analytics', analyticsRoutes); app.use('/api/v1/chat', chatRoutes);
  app.use(notFound); app.use(errorHandler); return app;
};
