import { nodeClient } from '@server/cloud';
import http from 'http';
import dns from 'node:dns/promises';
import app from './app';
import { config } from './configs/configs';
import {
  initializeMongoDB,
  initializeRedis,
} from './configs/initializeConnection';

// Set custom DNS servers for Node.js DNS module
// Note: 8.8.8.8 is Google's DNS, 1.1.1.1 is Cloudflare's DNS
dns.setServers(['1.1.1.1', '8.8.8.8']);

const httpServer = http.createServer(app);

// Utility: Graceful shutdown
async function gracefulShutdown(server: http.Server, signal: string) {
  console.log(`\n${signal} signal received: Closing HTTP server...`);

  // Close server
  server.close(async () => {
    console.log('✅ HTTP server closed 🛑');

    // Disconnect Redis clients
    try {
      await nodeClient.quit();
      console.log('✅ Node Redis client disconnected 🔌');
    } catch (error) {
      console.error(
        '❌ Error disconnecting Node Redis client 🔌:',
        (error as Error).message,
      );
    }

    process.exit(0);
  });
}

// Initialize MongoDB, Redis, Cloudinary, etc.
(async function initializeApplication() {
  try {
    await initializeMongoDB();
    await initializeRedis();
  } catch (error) {
    console.error(
      '❌ Application Initialization Failed 💥:',
      (error as Error).message,
    );
    process.exit(1);
  }
})();

httpServer.listen(Number(config.B2B_PORT), () => {
  console.log(
    `🚀 B2B server is running on port ${config.B2B_PORT} in ${config.NODE_ENV}`,
  );
});

// Graceful shutdown on termination signals
['SIGINT', 'SIGTERM'].forEach((signal) =>
  process.on(signal, () => gracefulShutdown(httpServer, signal)),
);

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('❌ UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('❌ UNHANDLED PROMISE REJECTION 💥:', err.message);
  process.exit(1);
});
