import { Controller, Post, Body, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { IdoService } from './ido.service';

@Controller('ido')
export class IdoController {
  private readonly logger = new Logger(IdoController.name);

  constructor(private readonly idoService: IdoService) {}

  @Post('ask')
  async ask(@Body('question') question: string): Promise<{ answer: string }> {
    //Basic validation and try-catch
    this.logger.log(`Received question: ${question}`);
    if (!question?.trim()) {
      this.logger.warn('Empty question received');
      return { answer: 'נא להזין שאלה' };
    }

    try {
      const answer = await this.idoService.getAnswer(question);
      return { answer: answer || 'No answer returned from service' };
    } catch (error) {
      this.logger.error('Error in ask endpoint', {
        error: error.message,
        stack: error.stack,
      });
      throw new HttpException(
          `Error while processing question: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
