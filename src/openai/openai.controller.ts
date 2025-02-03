import * as natural from 'natural';
import { Controller, Post, Body, OnModuleInit } from '@nestjs/common';
import { OpenAiService } from './openai.service';

@Controller('openai')
export class OpenAiController implements OnModuleInit {
  constructor(private readonly openAiService: OpenAiService) {}

  // We'll keep a simple in-memory object to store data
  private memory = { urlContent: '', fileContent: '' };

  async onModuleInit(): Promise<void> {
    console.log('--- Initializing Content ---');
    try {
      // Fetch content from the bank-yahav website
      this.memory.urlContent = await this.openAiService.fetchWebsiteContent('https://www.bank-yahav.co.il/');
      console.log('Initialized URL Content:', this.memory.urlContent);

      // Read local files from "customer_input"
      this.memory.fileContent = await this.openAiService.readLocalFiles('customer_input');
      console.log('Initialized File Content:', this.memory.fileContent);
    } catch (error) {
      console.error('Error during initialization:', error.message);
    }
  }

  // Utility to remove similar answers
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
        // If similarity > 0.8, we consider it almost the same
        return similarity > 0.8;
      });

      if (!isSimilar) {
        uniqueAnswers.push(answer.trim());
      }
    });

    return uniqueAnswers;
  }

  // Final processing of answers
  private processAnswers(answers: string[]): string {
    // Remove near-duplicate answers
    const filteredAnswers = this.removeSimilarAnswers(answers);

    // Deduplicate again by trimming
    const finalAnswers = [...new Set(filteredAnswers.map((answer) => answer.trim()))];

    // Combine into a single string
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
      // Split the file content into parts of 3000 characters
      const parts = this.openAiService.splitContent(this.memory.fileContent, 3000);
      // Send each part to the LLM
      const answers = await Promise.all(
          parts.map((part) => this.openAiService.getAnswerFromInitializedContent(question, part))
      );

      // Combine all partial answers
      const combinedAnswer = this.processAnswers(answers);
      console.log('Filtered Combined Answer:', combinedAnswer);
      return { answer: combinedAnswer };
    } catch (error) {
      console.error('Error in askFromFile:', error.message);
      return { error: error.message };
    }
  }
}
