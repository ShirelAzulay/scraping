import { Injectable } from '@nestjs/common';
import { Logging } from '@google-cloud/logging';
import * as path from 'path';

@Injectable()
export class GcpLoggerService {
  private logging: Logging;
  private logName = 'yahav-llm-logs';

  constructor() {
    this.logging = new Logging({
      keyFilename: path.resolve(__dirname, '../../config/bank-yahav-932-67f76abeec67.json'),
      projectId: 'bank-yahav-932',
    });
  }

  async log(severity: 'INFO' | 'ERROR' | 'WARNING' | 'DEBUG', message: string, metadata?: any) {
    const log = this.logging.log(this.logName);
    
    const entry = log.entry({
      severity,
      timestamp: new Date(),
      resource: {
        type: 'global',
      },
      labels: {
        environment: 'production',
        application: 'yahav-llm',
      },
      ...metadata && { jsonPayload: metadata }
    }, message);

    try {
      await log.write(entry);
    } catch (error) {
      console.error('Failed to write to GCP logs:', error);
    }
  }

  async info(message: string, metadata?: any) {
    await this.log('INFO', message, metadata);
  }

  async error(message: string, metadata?: any) {
    await this.log('ERROR', message, metadata);
  }

  async warn(message: string, metadata?: any) {
    await this.log('WARNING', message, metadata);
  }

  async debug(message: string, metadata?: any) {
    await this.log('DEBUG', message, metadata);
  }
} 