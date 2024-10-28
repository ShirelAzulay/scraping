import { Injectable } from '@nestjs/common';
import { Configuration, OpenAIApi } from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio'; // For parsing HTML content

@Injectable()
export class OpenAiService {
  private openai: OpenAIApi;

  constructor() {
    const configuration = new Configuration({
      apiKey: '',
    });
    this.openai = new OpenAIApi(configuration);
  }

  // Fetch website content using axios and cheerio for parsing
  async fetchWebsiteContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36',
        },
      });
      const html = response.data;
      const $ = cheerio.load(html);

      // Extract and return text content from the body tag
      const textContent = $('body').text().replace(/\s+/g, ' ').trim();
      return textContent;
    } catch (error) {
      console.error('Error fetching website content:', error.message);
      throw new Error('Failed to fetch website content');
    }
  }

  // Send the website content and the user's question to OpenAI
  async askOpenAi(question: string, websiteContent: string): Promise<string> {
    try {
      const response = await this.openai.createChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides answers in Hebrew based on the website content provided. Always provide detailed responses with proper formatting, including indentation, spacing, and links where possible. Do not mention the HTML source.'
          },
          {
            role: 'user',
            content: `שאלה: ${question}\n\nתוכן האתר שסופק:\n\n"${websiteContent}"\n\nאנא תן תשובה לשאלה בעברית בלבד. הקפד על אינדנטציה, רווחים וקישורים נכונים לאתרים במידת הצורך.`
          }
        ],
        max_tokens: 1000,
      });

      // Extract and format the response
      let answer = response.data.choices[0].message.content.trim();

      // Format answer (if additional formatting is needed)
      answer = answer.replace(/\*\*/g, '').replace(/#/g, ''); // Remove markdown-like syntax
      return answer;
    } catch (error) {
      console.error('Error calling OpenAI API:', error.response ? error.response.status : error.message);
      throw new Error('Failed to get response from OpenAI API');
    }
  }




}
