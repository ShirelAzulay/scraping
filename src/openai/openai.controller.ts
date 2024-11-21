import { Controller, Post, Body, OnModuleInit } from '@nestjs/common';
import { OpenAiService } from './openai.service';

@Controller('openai')
export class OpenAiController implements OnModuleInit {
  constructor(private readonly openAiService: OpenAiService) {}

  private memory = { urlContent: '', fileContent: '' };

  async onModuleInit(): Promise<void> {
    console.log('--- Initializing Content ---');
    try {
      this.memory.urlContent = await this.openAiService.fetchWebsiteContent('https://www.bank-yahav.co.il/');
      console.log('Initialized URL Content:', this.memory.urlContent);

      this.memory.fileContent = await this.openAiService.readLocalFiles('customer_input');
      console.log('Initialized File Content:', this.memory.fileContent);
    } catch (error) {
      console.error('Error during initialization:', error.message);
    }
  }

  @Post('ask-from-url')
  async askFromUrl(@Body('question') question: string): Promise<{ answer: string } | { error: string }> {
    console.log('--- Received Request for Ask from URL ---');
    console.log('Question:', question);

    try {
      const answer = await this.openAiService.getAnswerFromInitializedContent(question, this.memory.urlContent);
      console.log('Answer:', answer);
      return { answer };
    } catch (error) {
      console.error('Error in askFromUrl:', error.message);
      return { error: error.message };
    }
  }

  @Post('ask-from-file')
  async askFromFile(@Body('question') question: string): Promise<{ answer: string } | { error: string }> {
    console.log('--- Received Request for Ask from File ---');
    console.log('Question:', question);

    try {
      const parts = this.openAiService.splitContent(this.memory.fileContent, 3000);
      const answers = await Promise.all(
          parts.map((part) => this.openAiService.getAnswerFromInitializedContent(question, part))
      );
      const combinedAnswer = answers.join('\n');
      console.log('Combined Answer:', combinedAnswer);
      return { answer: combinedAnswer };
    } catch (error) {
      console.error('Error in askFromFile:', error.message);
      return { error: error.message };
    }
  }
}
