import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { promises as fs } from 'fs'; // Promise-based fs
import * as fsSync from 'fs';        // Regular fs for existsSync
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
      await this.gcpLogger.info('Starting to load customer input', {
        directory: dirPath,
        timestamp: new Date().toISOString()
      });

      const allFiles = await fs.readdir(dirPath);
      const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));

      if (htmlFiles.length === 0) {
        await this.gcpLogger.error('No HTML files found', { directory: dirPath });
        throw new Error('No HTML files found in customer_input directory');
      }

      const contents: string[] = [];

      // Process files sequentially with proper async/await
      for (const file of htmlFiles) {
        try {
          const filePath = path.join(dirPath, file);
          await this.gcpLogger.debug('Processing file', {
            file,
            path: filePath
          });

          const fileContent = await fs.readFile(filePath, 'utf-8');
          const $ = cheerio.load(fileContent); // Now fileContent is a string
          $('script, style, meta, link').remove();
          const text = $('body').text().replace(/\s+/g, ' ').trim();
          contents.push(text);

          await this.gcpLogger.debug('Processed file content', {
            file,
            contentLength: text.length,
            firstChars: text.substring(0, 100)
          });
        } catch (fileError) {
          await this.gcpLogger.error('Failed to process individual file', {
            file,
            error: fileError.message,
            stack: fileError.stack
          });
        }
      }

      this.fileContent = contents.join('\n\n');

      await this.gcpLogger.info('Customer input loading completed', {
        totalContentLength: this.fileContent.length,
        filesProcessed: htmlFiles.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await this.gcpLogger.error('Failed to load customer input', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async getAnswer(question: string): Promise<string> {
    try {
      await this.gcpLogger.info('Starting answer generation', {
        question,
        contentLength: this.fileContent.length,
        hasSystemPrompt: !!this.prompts?.system_instructions,
        timestamp: new Date().toISOString()
      });

      if (!this.fileContent) {
        await this.gcpLogger.error('Content validation failed', {
          error: 'No content loaded',
          fileContentLength: 0
        });
        throw new InternalServerErrorException('No content loaded from files');
      }

      // Fix keyFile check
      const keyFilePath = path.resolve(__dirname, '../../config/bank-yahav-932-67f76abeec67.json');
      await this.gcpLogger.debug('Initializing GCP auth', {
        keyFileExists: fsSync.existsSync(keyFilePath),
        endpoint: this.gcpEndpoint
      });

      const auth = new GoogleAuth({
        keyFile: keyFilePath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const client = await auth.getClient();
      await this.gcpLogger.info('GCP auth successful');

      const payload = {
        contents: [{
          role: 'user',
          parts: [{
            text: `Information:\n${this.fileContent}\n\nQuestion:\n${question}`,
          }],
        }],
        systemInstruction: {
          role: 'system',
          parts: [{
            text: this.prompts?.system_instructions || '',
          }],
        },
        generationConfig: this.modelConfig,
      };

      await this.gcpLogger.debug('Prepared LLM payload', {
        payloadSize: JSON.stringify(payload).length,
        questionLength: question.length,
        systemInstructionLength: this.prompts?.system_instructions?.length || 0,
        modelConfig: this.modelConfig
      });

      // Log before API call
      await this.gcpLogger.info('Sending request to LLM', {
        timestamp: new Date().toISOString(),
        endpoint: this.gcpEndpoint
      });

      const response = await client.request({
        url: this.gcpEndpoint,
        method: 'POST',
        data: payload,
      });

      // Log raw response
      await this.gcpLogger.debug('Received raw LLM response', {
        statusCode: response.status,
        hasData: !!response.data,
        responseSize: JSON.stringify(response.data).length,
        timestamp: new Date().toISOString()
      });

      if (!response.data) {
        await this.gcpLogger.error('Empty response from LLM', {
          response: response,
          timestamp: new Date().toISOString()
        });
        throw new InternalServerErrorException('Empty response from GCP');
      }

      const gcpResponse = response.data as GCPResponse;
      
      // Log response structure validation
      await this.gcpLogger.debug('Validating response structure', {
        hasCandidates: !!gcpResponse.candidates,
        candidatesLength: gcpResponse.candidates?.length,
        hasContent: !!gcpResponse.candidates?.[0]?.content,
        hasParts: !!gcpResponse.candidates?.[0]?.content?.parts
      });

      const answer = gcpResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!answer) {
        await this.gcpLogger.error('Invalid response structure', {
          rawResponse: gcpResponse,
          timestamp: new Date().toISOString()
        });
        throw new InternalServerErrorException('Invalid GCP response structure');
      }

      await this.gcpLogger.info('Successfully generated answer', {
        questionLength: question.length,
        answerLength: answer.length,
        processingTime: Date.now() - new Date().getTime(),
        timestamp: new Date().toISOString()
      });

      return answer;

    } catch (error) {
      await this.gcpLogger.error('Failed to get answer from LLM', {
        error: error.message,
        stack: error.stack,
        question,
        errorType: error.constructor.name,
        errorCode: error.code,
        response: error.response?.data,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
}
