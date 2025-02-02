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
    await this.logger.info('Received request', { question });

    if (!question?.trim()) {
      await this.logger.warn('Empty question received');
      return { answer: 'נא להזין שאלה' };
    }

    try {
      const answer = await this.idoService.getAnswer(question);
      await this.logger.info('Request processed successfully', {
        questionLength: question.length,
        answerLength: answer.length
      });
      return { answer };
    } catch (error) {
      await this.logger.error('Request processing failed', {
        error: error.message,
        stack: error.stack
      });
      throw new HttpException(
        `Error while processing question: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
