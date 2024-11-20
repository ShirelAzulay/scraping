import { Controller, Post, Body, OnModuleInit } from '@nestjs/common';
import { OpenAiService } from './openai.service';

@Controller('openai')
export class OpenAiController implements OnModuleInit {
  constructor(private readonly openAiService: OpenAiService) {}

  private memory = { urlContent: '', fileContent: '' };

  async onModuleInit(): Promise<void> {
    try {
      this.memory.urlContent = await this.openAiService.fetchWebsiteContent('https://www.bank-yahav.co.il/');
      this.memory.fileContent = await this.openAiService.readLocalFiles('customer_input');
      console.log('Content initialized successfully.');
    } catch (error) {
      console.error('Error initializing content:', error.message);
      throw new Error('Failed to initialize content.');
    }
  }

  @Post('ask-from-url')
  async askFromUrl(@Body('question') question: string): Promise<{ answer: string } | { error: string }> {
    try {
      if (!this.memory.urlContent) {
        throw new Error('Content for URL not found.');
      }
      const answer = await this.openAiService.getAnswerFromInitializedContent(question, this.memory.urlContent);
      return { answer };
    } catch (error) {
      console.error('Error in askFromUrl:', error.message);
      return { error: 'Failed to process the request from URL.' };
    }
  }

  @Post('ask-from-file')
  async askFromFile(@Body('question') question: string): Promise<{ answer: string } | { error: string }> {
    try {
      if (!this.memory.fileContent) {
        throw new Error('Content for files not found.');
      }

      const parts = this.openAiService.splitContent(this.memory.fileContent, 3000); // Split content into smaller parts
      const answers = [];
      for (const part of parts) {
        const answer = await this.openAiService.getAnswerFromInitializedContent(question, part);
        answers.push(answer);
      }
      return { answer: answers.join('\n') };
    } catch (error) {
      console.error('Error in askFromFile:', error.message);
      return { error: 'Failed to process the request from files.' };
    }
  }
}
