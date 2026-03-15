import dotenv from 'dotenv';
import { ProcessEnv } from './types/index.js';

dotenv.config({
  path: './.env',
  quiet: true,
  debug: process.env.DEBUG === 'true',
});

const requiredVars: Array<keyof ProcessEnv> = [
  'NODE_ENV',
  'DOMAIN',
  'GATEWAY_PORT',
  'AUTH_GATEWAY',
  'B2B_GATEWAY',
  'STORAGE_GATEWAY',
  'COOKIE_SECRET',
  'ADMIN_CLIENT_URL',
];

function validateEnv(env: ProcessEnv) {
  const missing = requiredVars.filter(
    (key) => !env[key] || env[key].trim() === '',
  );
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const env = process.env as unknown as ProcessEnv;
validateEnv(env);

const config: ProcessEnv = env;

export { config };
