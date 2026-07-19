import { env } from './config/env.js';
import { createApp } from './app.js';
import { attachRealtimeServer } from './config/realtime.js';
import { createDeadlineNotifications } from './jobs/deadline.job.js';

const app = createApp();

if (!process.env.VERCEL) {
  const server = app.listen(env.port, () =>
    console.log(`TaskFlow API listening on http://localhost:${env.port}`),
  );
  attachRealtimeServer(app, server);
  setInterval(() => createDeadlineNotifications().catch(console.error), 60 * 60 * 1000).unref();
}

export default app;