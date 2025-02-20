import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { promises as fs } from 'fs'; // Promise-based fs
import * as fsSync from 'fs';        // Synchronous fs for existsSync
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
    // Instead of doing heavy async calls in constructor, we can use it in onModuleInit if needed.
    this.initializeService().catch((error) => {
      // Log initialization error
      this.logger.error('Service initialization failed', error.stack);
      throw error;
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

      // Read config.yml
      const configFile = await fs.readFile(configPath, 'utf-8');
      const parsedConfig = parse(configFile);
      this.modelConfig = parsedConfig?.modelConfig;

      // Read prompts.json
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

      // Process files sequentially using async/await
      for (const file of htmlFiles) {
        try {
          const filePath = path.join(dirPath, file);
          await this.gcpLogger.debug('Processing file', {
            file,
            path: filePath
          });

          const fileContent = await fs.readFile(filePath, 'utf-8');
          const $ = cheerio.load(fileContent);
          $('script, style, meta, link').remove(); // Remove unnecessary tags
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

      // Join all files' text into a single content string
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
    const startTime = Date.now();
    const TIMEOUT = 60000; // Increased to 60 seconds from 40

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timed out'));
        }, TIMEOUT);
      });

      const answerPromise = this.generateAnswer(question);
      const answer = await Promise.race([answerPromise, timeoutPromise]);

      return answer as string;
    } catch (error) {
      await this.gcpLogger.error('Request failed', {
        error: error.message,
        duration: Date.now() - startTime,
        question
      });

      if (error.message === 'Request timed out') {
        throw new Error('קרתה תקלה, אנא נסה שנית');
      }
      throw error;
    }
  }

  // Separate the actual answer generation
  private async generateAnswer(question: string): Promise<string> {
    // Record the start time
    const startTime = Date.now();

    try {
      // Log the start of generating an answer
      await this.gcpLogger.info('Starting answer generation', {
        question,
        contentLength: this.fileContent.length,
        hasSystemPrompt: !!this.prompts?.system_instructions,
        timestamp: new Date().toISOString()
      });

      // Validate that fileContent is not empty
      if (!this.fileContent) {
        await this.gcpLogger.error('Content validation failed', {
          error: 'No content loaded',
          fileContentLength: 0
        });
        throw new InternalServerErrorException('No content loaded from files');
      }

      // Check if the key file is accessible
      const keyFilePath = path.resolve(__dirname, '../../config/bank-yahav-932-67f76abeec67.json');
      await this.gcpLogger.debug('Initializing GCP auth', {
        keyFileExists: fsSync.existsSync(keyFilePath),
        endpoint: this.gcpEndpoint
      });

      // Build Google Auth
      const auth = new GoogleAuth({
        keyFile: keyFilePath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();
      await this.gcpLogger.info('GCP auth successful');

      // Prepare LLM payload
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

      // Log debug info about the payload
      await this.gcpLogger.debug('Prepared LLM payload', {
        payloadSize: JSON.stringify(payload).length,
        questionLength: question.length,
        systemInstructionLength: this.prompts?.system_instructions?.length || 0,
        modelConfig: this.modelConfig
      });

      // Send request to GCP LLM with a timeout
      await this.gcpLogger.info('Sending request to LLM', {
        timestamp: new Date().toISOString(),
        endpoint: this.gcpEndpoint
      });

      const response = await client.request({
        url: this.gcpEndpoint,
        method: 'POST',
        data: payload,
        timeout: 60000, // Increased to 60 seconds from 35
      });

      // Log raw response metadata
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

      // Validate the response structure
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

      // Calculate the total processing time
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Final success log
      await this.gcpLogger.info('Successfully generated answer', {
        questionLength: question.length,
        answerLength: answer.length,
        processingTime, // Actual total time in milliseconds
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
