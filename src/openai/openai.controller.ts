import { Controller, Post, Body } from '@nestjs/common';
import { OpenAiService } from './openai.service';

@Controller('openai')
export class OpenAiController {
  constructor(private readonly openAiService: OpenAiService) {}

  // Endpoint for receiving the user's question
  @Post('ask')
  async askQuestion(@Body('question') question: string) {
    const url = 'https://www.pais.co.il/';
    const websiteContent = await this.openAiService.fetchWebsiteContent(url);
    const answer = await this.openAiService.askOpenAi(question, websiteContent);
    return { answer };
  }
}


