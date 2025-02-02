import { Module } from '@nestjs/common';
import { IdoController } from './ido.controller';
import { IdoService } from './ido.service';
import { GcpLoggerService } from '../utils/gcp-logger.service';

@Module({
  controllers: [IdoController],
  providers: [IdoService, GcpLoggerService],
})
export class IdoModule {} 