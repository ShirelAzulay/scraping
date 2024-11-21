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
    // Load the configuration from config.yml in the 'config' directory
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

    // Load prompts from prompts.json in the 'config' directory
    const promptsPath = path.join(__dirname, '..', '..', 'config', 'prompts.json');
    try {
      const promptsData = fs.readFileSync(promptsPath, 'utf-8');
      this.prompts = JSON.parse(promptsData);
      console.log('--- Prompts loaded successfully ---');
    } catch (error) {
      console.error('Error loading prompts:', error.message);
      this.prompts = {};
    }

    console.log('this.prompts after loading:', this.prompts);
  }

  // Function to fetch website content
  async fetchWebsiteContent(url: string): Promise<string> {
    console.log(`--- Starting fetchWebsiteContent for URL: ${url} ---`);
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
      const cleanedText = $('body').text().replace(/\s+/g, ' ').trim();
      console.log('--- Cleaned Text ---');
      return cleanedText;
    } catch (error) {
      console.error('Error fetching website content:', error.message);
      console.log('--- Using Fallback Content ---');
      return 'Unfortunately, I could not retrieve information from the website. Please try again later or provide more details.';
    }
  }

  // Function to read local files
  async readLocalFiles(directory: string): Promise<string> {
    console.log(`--- Starting readLocalFiles for directory: ${directory} ---`);
    try {
      const dirPath = path.join(__dirname, '..', '..', 'public', directory);
      const files = fs
          .readdirSync(dirPath)
          .filter((file) => file.endsWith('.html'));
      console.log('--- Found files: ---', files);

      if (files.length === 0) {
        console.log('--- No HTML files found. Using Fallback Content ---');
        return 'No files found in the specified directory.';
      }

      const contents = files.map((file) => {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        const $ = cheerio.load(content);
        $('script, style, meta, link').remove();
        return $('body').text().replace(/\s+/g, ' ').trim();
      });

      const combinedContent = contents.join('\n\n');
      console.log('--- Combined Content ---');
      return combinedContent;
    } catch (error) {
      console.error('Error reading local files:', error.message);
      console.log('--- Using Fallback Content ---');
      return 'Unfortunately, I could not read the files. Please check the directory and try again.';
    }
  }

  // Function to generate an answer from the model
  async getAnswerFromInitializedContent(
      question: string,
      content: string,
  ): Promise<string> {
    console.log('--- Starting getAnswerFromInitializedContent ---');
    console.log('Question:', question);

    if (!content || content.trim() === '') {
      console.error('Content is empty or undefined.');
      return 'אין מספיק מידע כדי לענות על השאלה. אנא ספק פרטים נוספים.';
    }

    const isHebrew = /[\u0590-\u05FF]/.test(question);

    // Build the system prompts from the loaded prompts
    let systemPrompts: string[] = [];

    // Check for inappropriate content
    if (this.isInappropriateContent(question)) {
      if (
          this.prompts.inappropriateContentPrompts &&
          this.prompts.inappropriateContentPrompts.length > 0
      ) {
        systemPrompts.push(
            this.getRandomPrompt(this.prompts.inappropriateContentPrompts),
        );

        // Build the final system prompt
        let systemPrompt = systemPrompts.join('\n');

        // Add language instruction only if not already included
        if (isHebrew && !systemPrompt.includes('ענה בעברית בלבד.')) {
          systemPrompt += '\n' + 'ענה בעברית בלבד.';
        } else if (
            !isHebrew &&
            !systemPrompt.includes('Answer in the same language as the question.')
        ) {
          systemPrompt += '\n' + 'Answer in the same language as the question.';
        }

        console.log('System Prompt:', systemPrompt);

        // Return the response directly without calling the model
        return systemPrompt;
      } else {
        console.error('Inappropriate content prompts are undefined or empty.');
        return 'התוכן שסופק אינו מתאים. אשמח לעזור לך בנושאים הקשורים לשירותים שלנו.';
      }
    } else {
      // General prompt
      if (this.prompts.generalPrompts && this.prompts.generalPrompts.length > 0) {
        systemPrompts.push(this.getRandomPrompt(this.prompts.generalPrompts));
      } else {
        console.error('General prompts are undefined or empty.');
      }

      // Greetings prompt
      if (
          this.isGreeting(question) &&
          this.prompts.greetingsPrompts &&
          this.prompts.greetingsPrompts.length > 0
      ) {
        systemPrompts.push(this.getRandomPrompt(this.prompts.greetingsPrompts));
      }

      // Response prompts based on the situation
      const situationPrompt = this.getSituationPrompt(question);
      if (situationPrompt) {
        systemPrompts.push(situationPrompt);
      }

      // Include a humor prompt if appropriate
      if (
          this.shouldUseHumor(question) &&
          this.prompts.humorPrompts &&
          this.prompts.humorPrompts.length > 0
      ) {
        systemPrompts.push(this.getRandomPrompt(this.prompts.humorPrompts));
      }

      // Additional prompt
      if (
          this.prompts.additionalPrompts &&
          this.prompts.additionalPrompts.length > 0
      ) {
        systemPrompts.push(this.getRandomPrompt(this.prompts.additionalPrompts));
      }

      // Build the final system prompt
      let systemPrompt = systemPrompts.join('\n');

      // Add language instruction only if not already included
      if (isHebrew && !systemPrompt.includes('ענה בעברית בלבד.')) {
        systemPrompt += '\n' + 'ענה בעברית בלבד.';
      } else if (
          !isHebrew &&
          !systemPrompt.includes('Answer in the same language as the question.')
      ) {
        systemPrompt += '\n' + 'Answer in the same language as the question.';
      }

      console.log('System Prompt:', systemPrompt);

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `השאלה: ${question}\nהתוכן:\n${content}`,
              },
            ],
          },
        ],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: systemPrompt,
            },
          ],
        },
        generationConfig: this.modelConfig,
        labels: {
          source: 'user-query',
          project: 'bank-yahav',
        },
      };

      console.log('--- Payload ---');
      console.log(JSON.stringify(payload, null, 2));

      try {
        // Use GoogleAuth with the Service Account JSON
        const auth = new GoogleAuth({
          keyFile: path.join(
              __dirname,
              '..',
              '..',
              'config',
              'bank-yahav-932-67f76abeec67.json',
          ), // Path to your service account JSON
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });

        const client = await auth.getClient();

        // Use the GCP endpoint
        const url = this.gcpEndpoint;

        const response = await client.request({
          url: url,
          method: 'POST',
          data: payload,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate, br',
          },
        });

        // Cast response.data to GCPResponse
        const responseData = response.data as GCPResponse;

        if (
            !responseData ||
            !responseData.candidates ||
            responseData.candidates.length === 0
        ) {
          console.error('No response received from GCP.');
          return 'לא התקבלה תשובה. אנא נסה לשאול שאלה אחרת או חזור מאוחר יותר.';
        }

        console.log('--- Response from GCP ---');
        console.log(JSON.stringify(responseData, null, 2));

        return responseData.candidates[0].content.parts[0].text.trim();
      } catch (error) {
        console.error(
            'Error fetching answer from GCP:',
            error.response?.data || error.message,
        );
        return 'אירעה שגיאה בעת קבלת המידע. אנא נסה שוב מאוחר יותר.';
      }
    }
  }

  // Function to get a random prompt from an array
  private getRandomPrompt(prompts: string[]): string {
    if (!prompts || prompts.length === 0) {
      console.error('Prompts array is undefined or empty.');
      return '';
    }
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  // Functions to identify audience and intent
  private isGreeting(question: string): boolean {
    const greetingKeywords = /בוקר טוב|ערב טוב|שלום|מה נשמע|מה שלומך|היי|הי/;
    return greetingKeywords.test(question.toLowerCase());
  }

  private shouldUseHumor(question: string): boolean {
    const humorKeywords = /למה חויבתי|לא מבין|שאלה טכנית|בעיה|מנוול/;
    return humorKeywords.test(question.toLowerCase());
  }

  private getSituationPrompt(question: string): string | null {
    if (
        /מתלונן|בעיה|לא עובד|תסכול/.test(question.toLowerCase()) &&
        this.prompts.responsePrompts?.clientComplains &&
        this.prompts.responsePrompts.clientComplains.length > 0
    ) {
      return this.getRandomPrompt(this.prompts.responsePrompts.clientComplains);
    } else if (
        /תודה|משבח|מעולה/.test(question.toLowerCase()) &&
        this.prompts.responsePrompts?.clientPraises &&
        this.prompts.responsePrompts.clientPraises.length > 0
    ) {
      return this.getRandomPrompt(this.prompts.responsePrompts.clientPraises);
    } else if (
        /שאלה טכנית|לא מבין|איך|מדוע/.test(question.toLowerCase()) &&
        this.prompts.responsePrompts?.technicalQuestion &&
        this.prompts.responsePrompts.technicalQuestion.length > 0
    ) {
      return this.getRandomPrompt(this.prompts.responsePrompts.technicalQuestion);
    }
    return null;
  }

  // Function to detect inappropriate content
  private isInappropriateContent(question: string): boolean {
    // Regular expression to detect inappropriate words
    // For policy compliance, avoid including specific disallowed content
    const inappropriateKeywords = /מילה1|מילה2|מילה3/; // Replace with appropriate words
    return inappropriateKeywords.test(question.toLowerCase());
  }

  // Function to split content
  splitContent(content: string, maxLength: number): string[] {
    console.log('--- Starting splitContent ---');

    if (!content) {
      console.error('Content is undefined or null.');
      return [];
    }

    console.log('Content Length:', content.length);

    const parts = [];
    while (content.length > 0) {
      parts.push(content.substring(0, maxLength));
      content = content.substring(maxLength);
    }

    console.log('--- Split Content Parts ---', parts);
    return parts;
  }
}
