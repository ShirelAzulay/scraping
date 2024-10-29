import { Injectable } from '@nestjs/common';
import { Configuration, OpenAIApi } from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio'; // For parsing HTML content
import { Client } from '@elastic/elasticsearch'; // Elasticsearch Client
import * as dotenv from 'dotenv'; // Import dotenv to load environment variables
dotenv.config(); // Load environment variables from .env file

@Injectable()
export class OpenAiService {
  private openai: OpenAIApi;
  private esClient: Client;

  constructor() {
    const configuration = new Configuration({
      //apiKey: process.env.OPENAI_API_KEY,
    });
    this.openai = new OpenAIApi(configuration);

    // Initialize Elasticsearch client
    this.esClient = new Client({
      node: 'http://localhost:9200', // Elasticsearch instance URL
    });
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
      answer = answer.replace(/\*\*/g, '').replace(/#/g, ''); // Remove markdown-like syntax

      // Save question and answer to Elasticsearch
      const userQuestion = question;
      const generatedAnswer = answer;

      // Save to Elasticsearch under index 'questions'
      const responseElastic = await this.esClient.index({
        index: 'questions', // Use the index pattern for questions
        body: {
          question: userQuestion,
          answer: generatedAnswer,
          timestamp: new Date(),
        }
      });

      console.log('Question saved to Elasticsearch:', responseElastic);
      return answer;
    } catch (error) {
      console.error('Error calling OpenAI API or saving to Elasticsearch:', error.response ? error.response.status : error.message);
      throw new Error('Failed to get response from OpenAI API or save to Elasticsearch');
    }
  }

  // Function to search the questions in Elasticsearch
  async searchQuestions(): Promise<any> {
    try {
      const searchResponse = await this.esClient.search({
        index: 'questions', // Search in the questions index pattern
        body: {
          query: {
            match_all: {} // Match all documents
          }
        }
      });
      console.log('Search results:', searchResponse.hits.hits);
      return searchResponse.hits.hits;
    } catch (error) {
      console.error('Error searching questions in Elasticsearch:', error.message);
      throw new Error('Failed to search questions in Elasticsearch');
    }
  }
}
