import { Module } from '@nestjs/common';
import { IdoModule } from './ido/ido.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [IdoModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
