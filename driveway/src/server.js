import { createApp } from './app.js';
import { getDb } from './db/index.js';
import { config } from './config.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';

getDb(); // open and migrate before accepting traffic

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Driveway running on http://localhost:${config.port} (${config.env})`);
  console.log(`Mail transport: ${config.mail.transport}${config.mail.transport === 'file' ? ` → ${config.mail.outDir}` : ''}`);
  startJobs();
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopJobs();
    server.close(() => process.exit(0));
  });
}
