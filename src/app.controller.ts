
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
  @Get()  // This handles GET /
  root(@Res() response: Response) {
    return response.sendFile('index.html');
  }
  @Get('hello') // This handles GET /hello
  getHello(): string {
    return this.appService.getHello();
  }
}