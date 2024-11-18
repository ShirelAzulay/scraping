import { Controller, Post, Body } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('openai')
export class OpenAiController {
  constructor(private readonly openAiService: OpenAiService) {}

  // Endpoint for receiving the user's question and reading from a URL
  @Post('ask-from-url')
  async askFromUrl(@Body('question') question: string, @Body('url') url: string) {
    console.log('Service:', this.openAiService);

    if (!url) {
      throw new Error('URL is required for this endpoint.');
    }

    // Fetch content from the URL
    const websiteContent = await this.openAiService.fetchWebsiteContent(url);
    const answer = await this.openAiService.askOpenAi(question, websiteContent);
    return { answer };
  }

  // Endpoint for receiving the user's question and reading from a local HTML file
  @Post('ask-from-file')
  async askFromFile(@Body('question') question: string) {
    console.log('Service:', this.openAiService);

    // Path to the local HTML file in the `public` directory
    const filePath = path.join(__dirname, '..', '..', 'public', 'loan_info.html');
    let websiteContent: string;

    try {
      // Read the file content
      websiteContent = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error('Error reading loan_info.html:', error.message);
      throw new Error('Failed to read the local HTML file.');
    }

    // Send the question to OpenAI with the file content
    const answer = await this.openAiService.askOpenAi(question, websiteContent);
    return { answer };
  }
}
