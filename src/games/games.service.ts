import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { pickRandomWord } from './draw-guess.word-bank';
import { getFallbackSvg, sanitizeSvg } from './draw-guess.svg-utils';
import type {
  DrawGuessCategory,
  DrawGuessDifficulty,
  DrawGuessRoundResponse,
} from './draw-guess.types';

function resolveOpenRouterChatUrl() {
  const configuredUrl = process.env.OPENROUTER_BASE_URL?.trim();

  if (!configuredUrl) {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  if (configuredUrl.endsWith('/chat/completions')) {
    return configuredUrl;
  }

  if (configuredUrl.endsWith('/api/v1')) {
    return `${configuredUrl}/chat/completions`;
  }

  if (configuredUrl.endsWith('/api/v1/')) {
    return `${configuredUrl}chat/completions`;
  }

  const normalizedBase = configuredUrl.replace(/\/+$/, '');

  if (normalizedBase.endsWith('/api')) {
    return `${normalizedBase}/v1/chat/completions`;
  }

  return `${normalizedBase}/api/v1/chat/completions`;
}

function getOpenRouterModels() {
  const configuredModel = process.env.OPENROUTER_MODEL?.trim();
  const fallbackModels = [
    '~google/gemini-flash-latest',
    'google/gemini-3.1-flash-lite',
    'google/gemini-3.5-flash',
  ];

  return Array.from(
    new Set(
      [configuredModel, ...fallbackModels].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
}

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  async createDrawGuessRound(
    category: DrawGuessCategory,
    difficulty: DrawGuessDifficulty,
  ): Promise<DrawGuessRoundResponse> {
    const word = pickRandomWord(category, difficulty);
    this.logger.log(
      `Creating Draw Guess round. Word=${word.answer}, Category=${word.category}, Difficulty=${word.difficulty}`,
    );
    const svg = await this.generateSvg(word.answer, word.category, word.difficulty);

    this.logger.log(`Draw Guess round ready for word=${word.answer}`);

    return {
      roundId: randomUUID(),
      svg,
      answer: word.answer,
      category,
      difficulty,
    };
  }

  private async generateSvg(
    answer: string,
    category: string,
    difficulty: string,
  ) {
    if (!process.env.OPENROUTER_API_KEY) {
      this.logger.warn(
        `OPENROUTER_API_KEY not set. Using fallback SVG for word=${answer}`,
      );
      return getFallbackSvg(answer);
    }

    const openRouterUrl = resolveOpenRouterChatUrl();

    for (const model of getOpenRouterModels()) {
      try {
        this.logger.log(
          `Requesting SVG from OpenRouter for word=${answer} via ${openRouterUrl} using model=${model}`,
        );
        const response = await fetch(openRouterUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer':
              process.env.OPENROUTER_SITE_URL ?? 'https://aiverseworld.com',
            'X-Title':
              process.env.OPENROUTER_APP_NAME ?? 'AiverseWorld Draw Guess',
          },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            messages: [
              {
                role: 'system',
                content:
                  'You create simple SVG drawings for browser games. Return SVG only. No markdown. No explanation. No text labels inside the drawing. Use a 200x200 viewBox, visible strokes, and simple shapes.',
              },
              {
                role: 'user',
                content: `Draw a simple ${difficulty.toLowerCase()} ${category.toLowerCase()} object for the word "${answer}". Return SVG only. Use path, circle, rect, ellipse, line, polygon, or polyline. No background. No text.`,
              },
            ],
          }),
        });

        if (!response.ok) {
          this.logger.warn(
            `OpenRouter returned HTTP ${response.status} for word=${answer} with model=${model}. Trying next model if available.`,
          );
          continue;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const svg = payload.choices?.[0]?.message?.content?.trim();

        if (!svg?.startsWith('<svg')) {
          this.logger.warn(
            `OpenRouter returned invalid SVG for word=${answer} with model=${model}. Trying next model if available.`,
          );
          continue;
        }

        this.logger.log(
          `OpenRouter SVG generated for word=${answer} with model=${model}`,
        );
        return sanitizeSvg(svg);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown OpenRouter error';
        this.logger.warn(
          `OpenRouter request failed for word=${answer} with model=${model}: ${message}. Trying next model if available.`,
        );
      }
    }

    this.logger.warn(
      `All OpenRouter model attempts failed for word=${answer}. Using fallback SVG.`,
    );
    return getFallbackSvg(answer);
  }
}
