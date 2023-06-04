import { serve } from '.';
import { sendNotification } from './helpers';
import * as Logger from './logger';

process.on('uncaughtException', function (err) {
  sendNotification('Uncaught exception on process, shutting down');
  Logger.log('Uncaught exception on process, shutting down:');
  Logger.error(err.stack);
  process.exit(1);
});

try {
  Logger.log('Ton Vote BE started');

  const server = serve();

  process.on('SIGINT', function () {
    sendNotification('Received SIGINT, shutting down');
    Logger.log('Received SIGINT, shutting down');
    if (server) {
      server.close(function (err: any) {
        if (err) {
          Logger.error(err.stack || err.toString());
        }
        process.exit();
      });
    }
  });
} catch (err: any) {
  sendNotification('Exception thrown from main, shutting down');
  Logger.log('Exception thrown from main, shutting down:');
  Logger.error(err.stack);
  process.exit(128);
}
