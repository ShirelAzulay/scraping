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
    await this.logger.info('Received request', { 
      question,
      timestamp: new Date().toISOString() 
    });

    if (!question?.trim()) {
      const message = 'נא להזין שאלה';
      await this.logger.warn('Empty question received');
      return { answer: message };
    }

    try {
      const answer = await this.idoService.getAnswer(question);
      
      if (!answer) {
        throw new Error('Empty answer received from service');
      }

      await this.logger.info('Request processed successfully', {
        questionLength: question.length,
        answerLength: answer.length,
        timestamp: new Date().toISOString()
      });
      
      return { answer };
    } catch (error) {
      const errorMessage = error.message || 'Unknown error occurred';
      
      await this.logger.error('Request processing failed', {
        error: errorMessage,
        stack: error.stack,
        question,
        timestamp: new Date().toISOString()
      });

      // Return a user-friendly error message
      return { answer: `אירעה שגיאה: ${errorMessage}` };
    }
  }
}
