import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { attachRealtimeServer } from './config/realtime.js';

await connectDatabase();

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(
    `TaskFlow API listening on port ${env.port}`,
  );
});

attachRealtimeServer(app, server);