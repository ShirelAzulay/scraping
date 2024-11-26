import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { Injectable } from '@nestjs/common';
import { Configuration, OpenAIApi, ChatCompletionRequestMessageRoleEnum } from 'openai';

@Injectable()
export class OpenAiService {
  private openai: OpenAIApi;

  constructor() {
    const apiKey = this.loadApiKeyFromConfig();
    if (!apiKey) {
      throw new Error('Failed to load OpenAI API key. Ensure the key exists in the configuration file.');
    }

    const configuration = new Configuration({
      apiKey: apiKey,
    });

    this.openai = new OpenAIApi(configuration);
    console.log('OpenAI API initialized successfully.');
  }

  // Function to load the API key from a JSON file
  private loadApiKeyFromConfig(): string | null {
    try {
      const configPath = path.join(__dirname, '..', '..', 'config', 'bank-yahav-932-openai_token.json');
      console.log(`Loading API key from config: ${configPath}`);
      const configFile = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configFile);
      if (config.apiKey) {
        return config.apiKey;
      } else {
        console.error('API key not found in the configuration file.');
        return null;
      }
    } catch (error) {
      console.error('Error loading API key from configuration file:', error.message);
      return null;
    }
  }

  async fetchWebsiteContent(url: string): Promise<string> {
    try {
      console.log(`Fetching content from URL: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
        },
        maxRedirects: 5,
      });
      console.log(`Successfully fetched content from: ${url}`);
      const $ = cheerio.load(response.data);
      $('script, style, meta, link').remove();
      const cleanedText = $('body').text().replace(/\s+/g, ' ').trim();
      console.log('Website content cleaned and prepared successfully.');
      return cleanedText;
    } catch (error) {
      console.error('Error fetching website content:', error.message);
      throw new Error('Failed to fetch website content.');
    }
  }

  async readLocalFiles(directory: string): Promise<string> {
    try {
      const dirPath = path.join(__dirname, '..', '..', 'public', directory);
      console.log(`Loading files from directory: ${dirPath}`);

      const files = fs.readdirSync(dirPath).filter((file) => file.endsWith('.html'));
      console.log(`HTML files found: ${files}`);

      if (files.length === 0) {
        throw new Error('No HTML files found in the directory.');
      }

      const contents = files.map((file) => {
        const filePath = path.join(dirPath, file);
        console.log(`Reading file: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf-8');
        const $ = cheerio.load(content);
        $('script, style, meta, link').remove();
        return $('body').text().replace(/\s+/g, ' ').trim();
      });

      console.log('Files successfully read and combined.');
      return contents.join('\n\n');
    } catch (error) {
      console.error('Error reading files:', error.message);
      throw new Error('Content for files not found.');
    }
  }

  async getAnswerFromInitializedContent(question: string, content: string): Promise<string> {
    try {
      if (!content || content.trim() === '') {
        throw new Error('Content is empty or undefined.');
      }

      const isHebrew = /[\u0590-\u05FF]/.test(question);

      // ביטוי רגולרי רחב לזיהוי שאלות על בנקים מתחרים או מונחים רלוונטיים
      const competitorKeywords = /בנק|מתחרה|מזרחי|לאומי|פועלים|דיסקונט|אגוד|ירושלים|ערבים|הלוואה|משכנתה|חשבונות/;
      const isCompetitorMentioned = competitorKeywords.test(question);

      const systemPrompt = isCompetitorMentioned
          ? 'אתה עוזר שמספק תשובות חכמות, משעשעות ושנונות שמתמקדות ביתרונות של בנק יהב בכל נושא שקשור לבנקים מתחרים, כולל סמיילי קריצה 😉.'
          : isHebrew
              ? 'אתה עוזר שמספק תשובות בעברית בלבד בהתבסס על התוכן שסופק.'
              : 'You are an assistant that provides answers in the same language as the question based on the given content.';

      console.log('Preparing request for OpenAI API...');
      if (isCompetitorMentioned) {
        console.log('Competitor mentioned in the question. Using tailored prompt.');
      }

      const payload = {
        model: 'gpt-4o',
        messages: [
          { role: ChatCompletionRequestMessageRoleEnum.System, content: systemPrompt },
          { role: ChatCompletionRequestMessageRoleEnum.User, content: `השאלה: ${question}\nהתוכן:\n${content}` },
        ],
        max_tokens: 1000,
      };

      console.log('Sending request to OpenAI API with payload:', JSON.stringify(payload, null, 2));

      const response = await this.openai.createChatCompletion(payload);

      if (!response || !response.data || !response.data.choices || response.data.choices.length === 0) {
        throw new Error('No response received from OpenAI.');
      }

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error calling OpenAI API:', error.message);
      throw new Error('Failed to get response from OpenAI API.');
    }
  }

  splitContent(content: string, maxLength: number): string[] {
    const parts = [];
    while (content.length > 0) {
      parts.push(content.substring(0, maxLength));
      content = content.substring(maxLength);
    }
    return parts;
  }
}
