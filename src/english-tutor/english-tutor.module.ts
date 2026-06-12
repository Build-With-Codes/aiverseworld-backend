import { Module } from '@nestjs/common';
import { EnglishTutorController } from './english-tutor.controller';
import { EnglishTutorService } from './english-tutor.service';

@Module({
  controllers: [EnglishTutorController],
  providers: [EnglishTutorService],
})
export class EnglishTutorModule {}
