import { Module } from '@nestjs/common';
import { OpenAiModule } from './openai/openai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [OpenAiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
