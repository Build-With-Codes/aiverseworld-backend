import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ProblemsController],
  providers: [ProblemsService],
})
export class ProblemsModule {}
