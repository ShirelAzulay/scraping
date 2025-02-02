import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { promises as fs } from 'fs'; //Use async file I/O
import * as path from 'path';
import * as cheerio from 'cheerio';
import { parse } from 'yaml';
import { GoogleAuth } from 'google-auth-library';
import { GcpLoggerService } from '../utils/gcp-logger.service';

interface GCPResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

@Injectable()
export class IdoService {
  private readonly logger = new Logger(IdoService.name);
  private readonly gcpEndpoint =
      'https://us-central1-aiplatform.googleapis.com/v1/projects/bank-yahav-932/locations/us-central1/publishers/google/models/gemini-1.5-pro-002:generateContent';

  private modelConfig: any;
  private prompts: any;
  private fileContent = '';

  constructor(private readonly gcpLogger: GcpLoggerService) {
    this.initializeService().catch((error) => {
      //Handle errors during initialization
      this.logger.error('Service initialization failed', error.stack);
      throw error; // Optionally throw to stop the app, or keep running with empty content
    });
  }

  private async initializeService(): Promise<void> {
    await this.loadConfigurations();
    await this.loadCustomerInput();
  }

  private async loadConfigurations(): Promise<void> {
    try {
      const configPath = path.join(__dirname, '..', '..', 'config', 'config.yml');
      const promptsPath = path.join(__dirname, '..', '..', 'config', 'prompts.json');

      const configFile = await fs.readFile(configPath, 'utf-8');
      const parsedConfig = parse(configFile);
      this.modelConfig = parsedConfig?.modelConfig;

      const promptsData = await fs.readFile(promptsPath, 'utf-8');
      this.prompts = JSON.parse(promptsData);

      this.logger.log('Configurations loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load configurations', error.stack);
      throw new InternalServerErrorException('Unable to load configuration files');
    }
  }

  private async loadCustomerInput(): Promise<void> {
    try {
      const dirPath = path.join(__dirname, '..', '..', 'public', 'customer_input');
      await this.gcpLogger.info(`Loading input from directory: ${dirPath}`);

      const allFiles = await fs.readdir(dirPath);
      const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));

      if (htmlFiles.length === 0) {
        throw new Error('No HTML files found in customer_input directory');
      }

      const contents: string[] = [];

      for (const file of htmlFiles) {
        try {
          const filePath = path.join(dirPath, file);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const $ = cheerio.load(fileContent);
          $('script, style, meta, link').remove();
          const text = $('body').text().replace(/\s+/g, ' ').trim();
          contents.push(text);
        } catch (fileError) {
          this.logger.warn(`Failed to process file ${file}: ${fileError.message}`);
        }
      }

      this.fileContent = contents.join('\n\n');
      await this.gcpLogger.info(
        `Loaded ${htmlFiles.length} file(s)`,
        { contentLength: this.fileContent.length }
      );
    } catch (error) {
      await this.gcpLogger.error('Failed to load customer input', {
        error: error.message,
        stack: error.stack
      });
      throw new InternalServerErrorException('Unable to load customer input files');
    }
  }

  async getAnswer(question: string): Promise<string> {
    await this.gcpLogger.info('Processing question', { question });

    if (!this.fileContent) {
      await this.gcpLogger.error('No content loaded');
      throw new InternalServerErrorException('No content loaded from files');
    }

    try {
      const auth = new GoogleAuth({
        keyFile: path.resolve(__dirname, '../../config/bank-yahav-932-67f76abeec67.json'),
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Information:\n${this.fileContent}\n\nQuestion:\n${question}`,
              },
            ],
          },
        ],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: this.prompts?.system_instructions || '',
            },
          ],
        },
        generationConfig: this.modelConfig,
      };

      await this.gcpLogger.debug('Sending request to GCP', {
        payloadLength: this.fileContent.length,
        questionLength: question.length
      });

      const response = await client.request({
        url: this.gcpEndpoint,
        method: 'POST',
        data: payload,
      });

      if (!response.data) {
        throw new InternalServerErrorException('Empty response from GCP');
      }

      const gcpResponse = response.data as GCPResponse;
      const answer = gcpResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!answer) {
        this.logger.error('Invalid GCP response structure', gcpResponse);
        throw new InternalServerErrorException('Invalid GCP response structure');
      }

      await this.gcpLogger.info('Answer generated successfully', {
        answerLength: answer.length
      });
      
      return answer;
    } catch (error) {
      await this.gcpLogger.error('Failed to get answer from GCP', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw new InternalServerErrorException(error.message || 'GCP request failed');
    }
  }
}
