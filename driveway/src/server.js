import { createApp } from './app.js';
import { getDb } from './db/index.js';
import { config } from './config.js';

getDb(); // open and migrate before accepting traffic

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Driveway running on http://localhost:${config.port} (${config.env})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
