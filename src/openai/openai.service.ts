import { Injectable } from '@nestjs/common';
import { Configuration, OpenAIApi } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class OpenAiService {
  private openai: OpenAIApi;

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
    this.openai = new OpenAIApi(configuration);
  }

  async fetchWebsiteContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching website content:', error.message);
      throw new Error('Failed to fetch website content.');
    }
  }

  async readLocalFile(fileName: string): Promise<string> {
    try {
      const filePath = path.join(__dirname, '..', '..', 'public', fileName);
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error('Error reading local file:', error.message);
      throw new Error('Failed to read the local file.');
    }
  }

  async getAnswerFromInitializedContent(question: string, content: string): Promise<string> {
    try {
      // Detect if the question is in Hebrew or another language
      const isHebrew = /[\u0590-\u05FF]/.test(question);

      const systemPrompt = isHebrew
          ? 'אתה עוזר שמספק תשובות בעברית בלבד בהתבסס על התוכן שסופק.'
          : 'You are an assistant that provides answers in the same language as the question based on the given content.';

      const response = await this.openai.createChatCompletion({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `השאלה: ${question}\nהתוכן:\n${content}` },
        ],
        max_tokens: 1000,
      });

      if (!response || !response.data || !response.data.choices || response.data.choices.length === 0) {
        throw new Error('No response from OpenAI.');
      }
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error calling OpenAI API:', error.message);
      throw new Error('Failed to get response from OpenAI API.');
    }
  }
}
