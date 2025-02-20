import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { IdoService } from './ido.service';
import { GcpLoggerService } from '../utils/gcp-logger.service';

@Controller('ido')
export class IdoController {
  constructor(
      private readonly idoService: IdoService,
      private readonly logger: GcpLoggerService
  ) {}

  @Post('ask')
  async ask(@Body('question') question: string): Promise<{ answer: string }> {
    try {
      await this.logger.info('Received request', {
        question,
        timestamp: new Date().toISOString()
      });

      if (!question?.trim()) {
        return { answer: 'נא להזין שאלה' };
      }

      const answer = await this.idoService.getAnswer(question);
      return { answer };

    } catch (error) {
      await this.logger.error('Request failed', {
        error: error.message,
        question,
        timestamp: new Date().toISOString()
      });

      // Always return a user-friendly message
      return { answer: 'קרתה תקלה, אנא נסה שנית' };
    }
  }
}
