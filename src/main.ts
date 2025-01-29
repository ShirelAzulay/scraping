import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    
    // Serve static files from public directory
    app.useStaticAssets(join(__dirname, '..', 'public'));
    
    app.enableCors();
    
    logger.log('Application starting...');
    await app.listen(3000);
    logger.log('Application is running on: http://localhost:3000');
  } catch (error) {
    logger.error('Failed to start application', error.stack);
    process.exit(1);
  }
}
bootstrap();
