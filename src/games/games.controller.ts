import { Body, Controller, Logger, Post } from '@nestjs/common';
import { GamesService } from './games.service';
import {
  drawGuessCategories,
  drawGuessDifficulties,
  type DrawGuessCategory,
  type DrawGuessDifficulty,
} from './draw-guess.types';

function isCategory(value: string): value is DrawGuessCategory {
  return drawGuessCategories.includes(value as DrawGuessCategory);
}

function isDifficulty(value: string): value is DrawGuessDifficulty {
  return drawGuessDifficulties.includes(value as DrawGuessDifficulty);
}

@Controller('api/games')
export class GamesController {
  private readonly logger = new Logger(GamesController.name);

  constructor(private readonly gamesService: GamesService) {}

  @Post('draw-guess')
  async createDrawGuessRound(
    @Body() body?: { category?: string; difficulty?: string },
  ) {
    const requestedCategory = body?.category ?? '';
    const requestedDifficulty = body?.difficulty ?? '';
    const category: DrawGuessCategory = isCategory(requestedCategory)
      ? requestedCategory
      : 'Random';
    const difficulty: DrawGuessDifficulty = isDifficulty(requestedDifficulty)
      ? requestedDifficulty
      : 'Easy';

    this.logger.log(
      `Draw Guess request received. Category=${category}, Difficulty=${difficulty}`,
    );

    return {
      data: await this.gamesService.createDrawGuessRound(category, difficulty),
    };
  }
}
