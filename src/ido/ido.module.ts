import { Module } from '@nestjs/common';
import { IdoController } from './ido.controller';
import { IdoService } from './ido.service';

@Module({
  controllers: [IdoController],
  providers: [IdoService],
})
export class IdoModule {} 