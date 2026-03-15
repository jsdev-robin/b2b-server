export interface ProcessEnv {
  // Server
  NODE_ENV: 'development' | 'production';
  DOMAIN: string;
  B2B_PORT: string;

  // Database
  DATABASE_ONLINE: string;
  DATABASE_PASSWORD_ONLINE: string;

  // Redis / Upstash
  NODE_REDIS_URL: string;
  NODE_REDIS_PORT: string;
  REDIS_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;

  // Secrets & Encryption
  COOKIE_SECRET: string;
  ACTIVATION_SECRET: string;
  CRYPTO_SECRET: string;
  HMAC_SECRET: string;

  // Auth Tokens
  ACCESS_TOKEN: string;
  REFRESH_TOKEN: string;
  PROTECT_TOKEN: string;

  // Client URL
  ADMIN_CLIENT_URL: string;
}
