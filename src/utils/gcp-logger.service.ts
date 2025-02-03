import { Injectable, LoggerService } from '@nestjs/common';
import { Logging } from '@google-cloud/logging';

@Injectable()
export class GcpLoggerService implements LoggerService {
  private readonly logging: Logging;

  constructor() {
    // Initialize Google Cloud Logging if you have proper GCP environment
    this.logging = new Logging({ projectId: 'your-project-id' });
  }

  // NestJS LoggerService: log
  async log(message: string, ...optionalParams: any[]) {
    console.log('[INFO]', message, JSON.stringify(optionalParams));
  }

  // Not strictly required by LoggerService, but let's keep it
  async info(message: string, meta: any = {}) {
    console.log('[INFO]', message, JSON.stringify(meta));
  }

  // Combine the two error methods into one
  async error(message: string, traceOrMeta?: string | any, context?: string) {
    if (traceOrMeta && typeof traceOrMeta === 'object') {
      // If the second argument is an object, treat it as meta
      console.error('[ERROR]', message, JSON.stringify(traceOrMeta));
    } else {
      // Otherwise treat it as the Nest standard signature: (message, trace?, context?)
      console.error('[ERROR]', message, traceOrMeta || '', context || '');
    }
  }

  // standard NestJS signature: warn
  async warn(message: string, ...optionalParams: any[]) {
    console.warn('[WARN]', message, JSON.stringify(optionalParams));
  }

  // debug
  async debug(message: string, meta: any = {}) {
    console.debug('[DEBUG]', message, JSON.stringify(meta));
  }

  // verbose
  async verbose(message: string, ...optionalParams: any[]) {
    console.log('[VERBOSE]', message, ...optionalParams);
  }
}
