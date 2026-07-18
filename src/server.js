import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { attachRealtimeServer } from './config/realtime.js';
import { createDeadlineNotifications } from './jobs/deadline.job.js';

await connectDatabase();
const app = createApp();

// Vercel invokes the exported Express application as a serverless function.
// Local and traditional Node deployments continue to use app.listen(), which
// also provides the HTTP server used by Socket.IO.
if (!process.env.VERCEL) {
  const server = app.listen(env.port, () =>
    console.log(`TaskFlow API listening on http://localhost:${env.port}`),
  );
  attachRealtimeServer(app, server);
  setInterval(
    () => createDeadlineNotifications().catch(console.error),
    60 * 60 * 1000,
  ).unref();
}

export default app;
