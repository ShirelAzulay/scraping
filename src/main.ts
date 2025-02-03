import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Listen to uncaught exceptions and unhandled promise rejections
  // This will help catch unexpected errors that are not handled by Nest
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err.stack || err.message);
    // Optionally, kill the process to avoid unknown state
    // process.exit(1);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at Promise:', reason);
    // Optionally, kill the process to avoid unknown state
    // process.exit(1);
  });

  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Use a global exception filter to catch and log all thrown exceptions
    app.useGlobalFilters(new AllExceptionsFilter());

    // Serve static files from the 'public' directory
    app.useStaticAssets(join(__dirname, '..', 'public'));

    // Enable CORS for cross-site requests
    app.enableCors();

    logger.log('Application starting...');
    await app.listen(3000);
    logger.log('Application is running on: http://localhost:3000');
  } catch (error) {
    // Log startup error and optionally exit
    logger.error('Failed to start application', error.stack);
    process.exit(1);
  }
}
bootstrap();
