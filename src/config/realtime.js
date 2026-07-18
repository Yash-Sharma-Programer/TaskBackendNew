import { Server } from 'socket.io';
import { env } from './env.js';
import { configureSockets } from '../sockets/index.js';

export const attachRealtimeServer = (app, server) => {
  // Express app.listen() returns the Node HTTP server. Socket.IO attaches to
  // that same server without creating or registering a second request handler.
  const io = new Server(server, {
    cors: { origin: env.clientUrls, credentials: true },
  });
  app.locals.io = io;
  configureSockets(io);
  return io;
};
