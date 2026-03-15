export interface ProcessEnv {
  // Server
  NODE_ENV: 'development' | 'production';
  DOMAIN: string;
  GATEWAY_PORT: string;
  AUTH_GATEWAY: string;
  B2B_GATEWAY: string;
  STORAGE_GATEWAY: string;

  COOKIE_SECRET: string;

  // Client URL
  ADMIN_CLIENT_URL: string;
}
