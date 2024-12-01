import * as natural from 'natural';
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

  private removeSimilarAnswers(answers: string[]): string[] {
    const tokenizer = new natural.WordTokenizer();
    const uniqueAnswers: string[] = [];

    answers.forEach((answer) => {
      const isSimilar = uniqueAnswers.some((existingAnswer) => {
        const answerTokens = tokenizer.tokenize(answer.toLowerCase());
        const existingTokens = tokenizer.tokenize(existingAnswer.toLowerCase());
        const similarity = natural.JaroWinklerDistance(
            answerTokens.join(' '),
            existingTokens.join(' ')
        );
        return similarity > 0.85; // סף דמיון
      });

      if (!isSimilar) {
        uniqueAnswers.push(answer.trim());
      }
    });

    return uniqueAnswers;
  }

  private processAnswers(answers: string[]): string {
    // סינון תשובות דומות
    const filteredAnswers = this.removeSimilarAnswers(answers);

    // סינון סופי של תשובות עם חזרות קלות
    const finalAnswers = [...new Set(filteredAnswers.map((answer) => answer.trim()))];

    // שילוב תשובות
    return finalAnswers.join('\n');
  }

  @Post('ask-from-url')
  async askFromUrl(@Body('question') question: string): Promise<{ answer: string } | { error: string }> {
    console.log('--- Received Request for Ask from URL ---');
    console.log('Question:', question);

    try {
      const answer = await this.openAiService.getAnswerFromInitializedContent(question, this.memory.urlContent);
      const filteredAnswer = this.processAnswers([answer]);
      console.log('Filtered Answer:', filteredAnswer);
      return { answer: filteredAnswer };
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

      const combinedAnswer = this.processAnswers(answers);
      console.log('Filtered Combined Answer:', combinedAnswer);
      return { answer: combinedAnswer };
    } catch (error) {
      console.error('Error in askFromFile:', error.message);
      return { error: error.message };
    }
  }
}
