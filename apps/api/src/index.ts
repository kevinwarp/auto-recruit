import 'dotenv/config';
import { loadEnv } from '@auto-recruit/config';
import { createApp } from './app.js';

const env = loadEnv();

const app = createApp();

app.listen(env.API_PORT, () => {
  console.log(`[api] listening on port ${env.API_PORT}`);
});
