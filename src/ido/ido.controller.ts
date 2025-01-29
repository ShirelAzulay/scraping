import { Controller, Post, Body, Logger } from '@nestjs/common';
import { IdoService } from './ido.service';

@Controller('ido')
export class IdoController {
  private readonly logger = new Logger(IdoController.name);

  constructor(private readonly idoService: IdoService) {}

  @Post('ask')
  async ask(@Body('question') question: string): Promise<{ answer: string }> {
    this.logger.log(`Received question: ${question}`);
    console.log(`Received question: ${question}`);

    if (!question?.trim()) {
      this.logger.warn('Empty question received');
      return { answer: 'נא להזין שאלה' };
    }

    try {
      this.logger.log('Calling IdoService.getAnswer');
      const answer = await this.idoService.getAnswer(question);
      this.logger.log(`Answer received, length: ${answer?.length}`);
      return { answer: answer || 'לא התקבלה תשובה מהשרת' };
    } catch (error) {
      this.logger.error('Error processing question', {
        error: error.message,
        stack: error.stack,
      });
      console.error('Error details:', error);
      return { answer: `שגיאה: ${error.message}` };
    }
  }
} 