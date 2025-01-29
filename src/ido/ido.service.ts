import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { parse } from 'yaml';
import { GoogleAuth } from 'google-auth-library';

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
export class IdoService {
  private readonly logger = new Logger(IdoService.name);
  private readonly gcpEndpoint = 'https://us-central1-aiplatform.googleapis.com/v1/projects/bank-yahav-932/locations/us-central1/publishers/google/models/gemini-1.5-pro-002:generateContent';
  private modelConfig: any;
  private prompts: any;
  private fileContent: string = '';

  constructor() {
    this.initializeService().catch(error => {
      this.logger.error('Failed to initialize service', error.stack);
      throw error;
    });
  }

  private async initializeService() {
    try {
      await this.loadConfigurations();
      await this.loadCustomerInput();
    } catch (error) {
      this.logger.error(`Service initialization failed: ${error.message}`);
      throw error;
    }
  }

  private async loadConfigurations() {
    const configPath = path.join(__dirname, '..', '..', 'config', 'config.yml');
    const promptsPath = path.join(__dirname, '..', '..', 'config', 'prompts.json');

    try {
      const configFile = fs.readFileSync(configPath, 'utf-8');
      this.modelConfig = parse(configFile).modelConfig;
      
      const promptsData = fs.readFileSync(promptsPath, 'utf-8');
      this.prompts = JSON.parse(promptsData);
      
      this.logger.log('Configurations loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load configurations', error.stack);
      throw error;
    }
  }

  private async loadCustomerInput(): Promise<void> {
    const dirPath = path.join(__dirname, '..', '..', 'public', 'customer_input');
    this.logger.log(`Loading files from: ${dirPath}`);

    try {
      const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.html'));
      
      if (files.length === 0) {
        throw new Error('No HTML files found in customer_input directory');
      }

      const contents = await Promise.all(files.map(async file => {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const $ = cheerio.load(content);
        $('script, style, meta, link').remove();
        return $('body').text().replace(/\s+/g, ' ').trim();
      }));

      this.fileContent = contents.join('\n\n');
      this.logger.log(`Loaded ${files.length} files, total content length: ${this.fileContent.length}`);
    } catch (error) {
      this.logger.error('Failed to load customer input', error.stack);
      throw error;
    }
  }

  async getAnswer(question: string): Promise<string> {
    this.logger.log(`Processing question: ${question}`);
    
    if (!this.fileContent) {
      throw new Error('No content loaded from files');
    }

    try {
      const auth = new GoogleAuth({
        keyFile: path.resolve(__dirname, '../../config/bank-yahav-932-67f76abeec67.json'),
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const client = await auth.getClient();
      
      const payload = {
        contents: [{
          role: 'user',
          parts: [{
            text: `מידע:\n${this.fileContent}\n\nשאלה:\n${question}`,
          }],
        }],
        systemInstruction: {
          role: 'system',
          parts: [{
            text: this.prompts.system_instructions || '',
          }],
        },
        generationConfig: this.modelConfig,
      };

      this.logger.log('Sending request to GCP');
      const response = await client.request({
        url: this.gcpEndpoint,
        method: 'POST',
        data: payload,
      });

      if (!response.data) {
        throw new Error('Empty response from GCP');
      }

      const gcpResponse = response.data as GCPResponse;
      
      if (!gcpResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
        this.logger.error('Invalid GCP response structure', response.data);
        throw new Error('Invalid response structure from GCP');
      }

      const answer = gcpResponse.candidates[0].content.parts[0].text.trim();
      this.logger.log(`Answer generated successfully, length: ${answer.length}`);
      return answer;

    } catch (error) {
      this.logger.error('Failed to get answer', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw error;
    }
  }
} 