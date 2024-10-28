import { Module } from '@nestjs/common';
import { OpenAiModule } from './openai/openai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [OpenAiModule],  // הוספת OpenAiModule ל-imports
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
