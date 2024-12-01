import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { Injectable } from '@nestjs/common';
import { parse } from 'yaml';
import { GoogleAuth } from 'google-auth-library';

// Define interfaces
interface GCPResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

@Injectable()
export class OpenAiService {
  private readonly gcpEndpoint =
      'https://us-central1-aiplatform.googleapis.com/v1/projects/bank-yahav-932/locations/us-central1/publishers/google/models/gemini-1.5-pro-002:generateContent';
  private modelConfig: any;
  private prompts: any;

  constructor() {
    const configPath = path.join(__dirname, '..', '..', 'config', 'config.yml');
    try {
      const configFile = fs.readFileSync(configPath, 'utf-8');
      const config = parse(configFile);
      this.modelConfig = config.modelConfig;
      console.log('--- Configuration loaded successfully ---');
    } catch (error) {
      console.error('Error loading configuration:', error.message);
      this.modelConfig = {};
    }

    const promptsPath = path.join(__dirname, '..', '..', 'config', 'prompts.json');
    try {
      const promptsData = fs.readFileSync(promptsPath, 'utf-8');
      this.prompts = JSON.parse(promptsData);
      console.log('--- Prompts loaded successfully ---');
    } catch (error) {
      console.error('Error loading prompts:', error.message);
      this.prompts = {};
    }

    const serviceAccountPath = path.resolve(__dirname, '../../config/bank-yahav-932-67f76abeec67.json');
    if (!fs.existsSync(serviceAccountPath)) {
      console.error(`Service account file not found: ${serviceAccountPath}`);
      throw new Error('Service account file is missing. Application cannot start.');
    }
  }

  async fetchWebsiteContent(url: string): Promise<string> {
    console.log(`--- Fetching website content for URL: ${url} ---`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
        },
      });
      console.log('--- Successfully fetched content ---');
      const $ = cheerio.load(response.data);
      $('script, style, meta, link').remove();
      return $('body').text().replace(/\s+/g, ' ').trim();
    } catch (error) {
      console.error('Error fetching website content:', error.message);
      return 'לצערי, לא הצלחתי לקבל מידע מהאתר. אנא נסה שוב מאוחר יותר.';
    }
  }

  async readLocalFiles(directory: string): Promise<string> {
    console.log(`--- Reading local files from directory: ${directory} ---`);
    try {
      const dirPath = path.join(__dirname, '..', '..', 'public', directory);
      const files = fs
          .readdirSync(dirPath)
          .filter((file) => file.endsWith('.html'));
      if (files.length === 0) return 'לא נמצאו קבצים בתיקייה שצוינה.';
      const contents = files.map((file) => {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        const $ = cheerio.load(content);
        $('script, style, meta, link').remove();
        return $('body').text().replace(/\s+/g, ' ').trim();
      });
      return contents.join('\n\n');
    } catch (error) {
      console.error('Error reading local files:', error.message);
      return 'לצערי, לא הצלחתי לקרוא את הקבצים. אנא בדוק את התיקייה ונסה שוב.';
    }
  }


  splitContent(content: string, maxLength: number): string[] {
    console.log('--- Splitting content ---');

    if (!content || typeof content !== 'string') {
      console.error('Content is undefined, null, or not a string.');
      return [];
    }

    const parts = [];
    while (content.length > 0) {
      parts.push(content.substring(0, maxLength));
      content = content.substring(maxLength);
    }

    console.log('--- Content split into parts ---');
    console.log(parts);
    return parts;
  }

  async getAnswerFromInitializedContent(question: string, content: string): Promise<string> {
    console.log('--- Generating answer for the question ---');
    console.log('Question:', question);
    console.log('Content:', content);

    if (!content || content.trim() === '') {
      return 'אין מספיק מידע כדי לענות על השאלה. אנא ספק פרטים נוספים.';
    }

    const systemPrompt = this.prompts.system_instructions || '';
    const examples = this.prompts.examples
        ? this.prompts.examples
            .map((example: any) => `שאלה: ${example.question}\nתשובה: ${example.answer}`)
            .join('\n\n')
        : '';

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `שאלה: ${question}\nתוכן:\n${content}`,
            },
          ],
        },
      ],
      systemInstruction: {
        role: 'system',
        parts: [
          {
            text: `${systemPrompt}\n\nדוגמאות:\n${examples}`,
          },
        ],
      },
      generationConfig: {
        ...this.modelConfig,
      },
      labels: {
        source: 'user-query',
        project: 'bank-yahav',
      },
    };

    console.log('--- Payload ---');
    console.log(JSON.stringify(payload, null, 2));

    try {
      const auth = new GoogleAuth({
        keyFile: path.resolve(__dirname, '../../config/bank-yahav-932-67f76abeec67.json'),
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const client = await auth.getClient();
      const response = await client.request({
        url: this.gcpEndpoint,
        method: 'POST',
        data: payload,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseData = response.data as GCPResponse;

      if (!responseData || !responseData.candidates || responseData.candidates.length === 0) {
        console.error('No response received from GCP.');
        return 'לא התקבלה תשובה. אנא נסה שוב.';
      }

      let answer = responseData.candidates[0].content.parts[0].text.trim();

      // Remove duplicate or similar lines from the individual answer
      answer = this.removeDuplicateLines(answer);

      console.log('--- Final Answer ---');
      console.log(answer);

      return answer;
    } catch (error) {
      console.error('Error fetching answer from GCP:', error.message);
      return 'אירעה שגיאה בעת קבלת המידע. אנא נסה שוב.';
    }
  }

// Utility function to remove duplicate or similar lines
  private removeDuplicateLines(input: string): string {
    const lines = input.split('\n');
    const uniqueLines: string[] = [];
    const seenLines = new Set<string>();

    lines.forEach((line) => {
      const normalizedLine = line.trim().toLowerCase(); // Normalize case and trim spaces
      if (!seenLines.has(normalizedLine)) {
        uniqueLines.push(line);
        seenLines.add(normalizedLine);
      }
    });

    return uniqueLines.join('\n');
  }

}
