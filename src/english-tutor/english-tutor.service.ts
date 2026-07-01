import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  EnglishTutorProgressResponse,
  EnglishTutorRealtimeRequest,
  EnglishTutorRealtimeSession,
  EnglishTutorSaveTurnRequest,
  EnglishTutorTurnRequest,
  EnglishTutorTurnResponse,
} from './english-tutor.types';

const fillerWords = ['um', 'uh', 'like', 'actually', 'basically'];
const realtimeModel = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime';
const realtimeVoice = process.env.OPENAI_REALTIME_VOICE ?? 'marin';

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
    'nex-agi/nex-n2-pro:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
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
export class EnglishTutorService {
  private readonly logger = new Logger(EnglishTutorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTurn(
    request: EnglishTutorTurnRequest,
  ): Promise<EnglishTutorTurnResponse> {
    const transcript = this.normalizeTranscript(request.transcript);
    const focus = request.focus?.trim() || 'Daily conversation';
    const correction = this.buildCorrection(transcript);
    const score = this.scoreTranscript(transcript, correction);
    const sessionId = request.sessionId || crypto.randomUUID();
    const openRouterTurn = await this.createOpenRouterTurn({
      transcript,
      focus,
      correction,
      score,
      sessionId,
    });

    if (openRouterTurn) {
      return openRouterTurn;
    }

    return {
      sessionId,
      transcript,
      reply: this.buildReply(transcript, correction, focus),
      correction,
      score,
      focus,
      nextQuestion: this.nextQuestionForFocus(focus),
    };
  }

  private async createOpenRouterTurn(input: {
    transcript: string;
    focus: string;
    correction: string;
    score: number;
    sessionId: string;
  }): Promise<EnglishTutorTurnResponse | null> {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();

    if (!apiKey || !input.transcript) {
      return null;
    }

    const openRouterUrl = resolveOpenRouterChatUrl();

    for (const model of getOpenRouterModels()) {
      try {
        const response = await fetch(openRouterUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer':
              process.env.OPENROUTER_SITE_URL ?? 'https://aiverseworld.com',
            'X-OpenRouter-Title':
              process.env.OPENROUTER_APP_NAME ?? 'AiverseWorld English Tutor',
          },
          body: JSON.stringify({
            model,
            temperature: 0.35,
            max_tokens: 220,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are a warm, concise English speaking tutor. Return JSON only with these string keys: reply, correction, nextQuestion. Keep reply under 45 words. Correct grammar naturally and explain briefly. Do not shame the learner.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  focus: input.focus,
                  learnerSentence: input.transcript,
                  localCorrection: input.correction,
                }),
              },
            ],
          }),
        });

        if (!response.ok) {
          this.logger.warn(
            `OpenRouter returned HTTP ${response.status} for English tutor with model=${model}. Trying fallback if available.`,
          );
          continue;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content?.trim();

        if (!content) {
          continue;
        }

        const parsed = JSON.parse(content) as {
          reply?: string;
          correction?: string;
          nextQuestion?: string;
        };

        return {
          sessionId: input.sessionId,
          transcript: input.transcript,
          reply:
            parsed.reply?.trim() ||
            this.buildReply(input.transcript, input.correction, input.focus),
          correction: parsed.correction?.trim() || input.correction,
          score: input.score,
          focus: input.focus,
          nextQuestion:
            parsed.nextQuestion?.trim() || this.nextQuestionForFocus(input.focus),
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown OpenRouter error';
        this.logger.warn(
          `OpenRouter tutor request failed with model=${model}: ${message}. Trying fallback if available.`,
        );
      }
    }

    return null;
  }

  async createRealtimeSession(
    request: EnglishTutorRealtimeRequest,
  ): Promise<EnglishTutorRealtimeSession> {
    const sessionId = await this.createStoredSession({
      focus: request.focus,
      userId: request.userId,
      provider: 'openai-realtime',
    });

    return {
      sessionId,
      realtimeModel,
      voice: realtimeVoice,
      instructions: this.buildRealtimeInstructions(request.focus),
    };
  }

  async createRealtimeCall(sdpOffer: string, request: EnglishTutorRealtimeRequest) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        {
          code: 'OPENAI_API_KEY_MISSING',
          error:
            'OPENAI_API_KEY is not configured in the backend service. Realtime voice cannot start without it.',
        },
      );
    }

    const session = await this.createRealtimeSession(request);
    const form = new FormData();
    form.set('sdp', sdpOffer);
    form.set(
      'session',
      JSON.stringify({
        type: 'realtime',
        model: realtimeModel,
        instructions: session.instructions,
        audio: {
          input: {
            transcription: {
              model: process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe',
              language: 'en',
              prompt:
                'The learner is practicing English conversation. Preserve grammar mistakes in the transcript.',
            },
            turn_detection: {
              type: 'server_vad',
              create_response: true,
              interrupt_response: true,
              silence_duration_ms: 650,
              prefix_padding_ms: 300,
            },
          },
          output: {
            voice: realtimeVoice,
          },
        },
      }),
    );

    const response = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(
        realtimeModel,
      )}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
        body: form,
      },
    );

    const answerSdp = await response.text();

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'OPENAI_REALTIME_CALL_FAILED',
        error: answerSdp,
      });
    }

    return {
      sdp: answerSdp,
      session,
    };
  }

  async saveTurn(request: EnglishTutorSaveTurnRequest) {
    const userText = this.normalizeTranscript(request.userText);
    const tutorText = this.normalizeTranscript(request.tutorText);
    const focus = request.focus?.trim() || 'Daily conversation';
    const sessionId =
      request.sessionId ||
      (await this.createStoredSession({
        focus,
        userId: request.userId,
        provider: request.provider ?? 'openai-realtime',
      }));
    const correction = request.correction || this.buildCorrection(userText);
    const score = this.scoreTranscript(userText, correction);
    const mistakes = this.extractMistakes(userText, correction);

    if (!(await this.prisma.ensureAvailable())) {
      return {
        saved: false,
        sessionId,
        correction,
        score,
        mistakes,
      };
    }

    const client = this.prisma.getClient();
    if (!client) {
      return {
        saved: false,
        sessionId,
        correction,
        score,
        mistakes,
      };
    }

    try {
      const turn = await client.englishTutorTurn.create({
        data: {
          sessionId,
          userId: request.userId,
          userText,
          tutorText,
          correction,
          score,
          focus,
          provider: request.provider ?? 'openai-realtime',
          mistakes: {
            create: mistakes.map((mistake) => ({
              sessionId,
              userId: request.userId,
              mistake: mistake.mistake,
              correction: mistake.correction,
              category: mistake.category,
            })),
          },
        },
      });

      const aggregate = await client.englishTutorTurn.aggregate({
        where: { sessionId },
        _avg: { score: true },
      });

      await client.englishTutorSession.update({
        where: { id: sessionId },
        data: {
          focus,
          userId: request.userId,
          averageScore: Math.round(aggregate._avg.score ?? score),
        },
      });

      return {
        saved: true,
        sessionId,
        turnId: turn.id,
        correction,
        score,
        mistakes,
      };
    } catch (error) {
      this.prisma.markUnavailable(this.formatPersistenceError(error));
      return {
        saved: false,
        sessionId,
        correction,
        score,
        mistakes,
      };
    }
  }

  async getProgress(userId?: string): Promise<EnglishTutorProgressResponse> {
    if (!(await this.prisma.ensureAvailable())) {
      return { enabled: false, sessions: [], commonMistakes: [] };
    }

    const client = this.prisma.getClient();
    if (!client) {
      return { enabled: false, sessions: [], commonMistakes: [] };
    }

    const where = userId ? { userId } : {};
    try {
      const [sessions, groupedMistakes] = await Promise.all([
        client.englishTutorSession.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          take: 10,
          include: { _count: { select: { turns: true } } },
        }),
        client.englishTutorMistake.groupBy({
          by: ['mistake', 'correction', 'category'],
          where,
          _sum: { count: true },
          orderBy: { _sum: { count: 'desc' } },
          take: 8,
        }),
      ]);

      return {
        enabled: true,
        sessions: sessions.map((session) => ({
          id: session.id,
          focus: session.focus,
          averageScore: session.averageScore,
          startedAt: session.startedAt.toISOString(),
          turnCount: session._count.turns,
        })),
        commonMistakes: groupedMistakes.map((mistake) => ({
          mistake: mistake.mistake,
          correction: mistake.correction,
          category: mistake.category,
          count: mistake._sum.count ?? 0,
        })),
      };
    } catch (error) {
      this.prisma.markUnavailable(this.formatPersistenceError(error));
      return { enabled: false, sessions: [], commonMistakes: [] };
    }
  }

  private async createStoredSession(input: {
    focus?: string;
    userId?: string;
    provider?: string;
  }) {
    if (!(await this.prisma.ensureAvailable())) {
      return crypto.randomUUID();
    }

    const client = this.prisma.getClient();

    if (!client) {
      return crypto.randomUUID();
    }

    try {
      const session = await client.englishTutorSession.create({
        data: {
          focus: input.focus?.trim() || 'Daily conversation',
          userId: input.userId,
          provider: input.provider ?? 'openai-realtime',
        },
      });

      return session.id;
    } catch (error) {
      this.prisma.markUnavailable(this.formatPersistenceError(error));
      return crypto.randomUUID();
    }
  }

  private formatPersistenceError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'English tutor persistence failed.';
  }

  private buildRealtimeInstructions(focus?: string) {
    const practiceFocus = focus?.trim() || 'Daily conversation';

    return [
      'You are a warm, concise English speaking tutor.',
      `Practice mode: ${practiceFocus}.`,
      'Hold a natural spoken conversation with the learner.',
      'When the learner makes a grammar or vocabulary mistake, briefly correct it.',
      'Use this pattern: encouragement, corrected sentence, one short explanation, one follow-up question.',
      'Keep replies under 45 words unless the learner asks for a detailed explanation.',
      'Do not shame the learner. Do not switch away from English unless they ask.',
      'Examples: If the learner says "I want practice English", say "Great! A better sentence is: I want to practice English. We use to before practice here. What did you do today?"',
    ].join('\n');
  }

  private normalizeTranscript(value?: string) {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private buildCorrection(transcript: string) {
    if (!transcript) {
      return 'Please say one complete sentence so I can correct it.';
    }

    const lower = transcript.toLowerCase();
    const corrected = transcript
      .replace(/\bi want practice\b/gi, 'I want to practice')
      .replace(/\byesterday i go beach\b/gi, 'Yesterday I went to the beach')
      .replace(/\bi go beach\b/gi, 'I went to the beach')
      .replace(/\bi am go\b/gi, 'I am going')
      .replace(/\bi did went\b/gi, 'I went')
      .replace(/\bhe go\b/gi, 'he goes')
      .replace(/\bshe go\b/gi, 'she goes')
      .replace(/\bmore better\b/gi, 'better');

    if (corrected !== transcript) {
      return `A more natural sentence is: "${this.capitalize(corrected)}"`;
    }

    if (fillerWords.some((word) => lower.includes(` ${word} `))) {
      return 'Good idea. Try reducing filler words and pausing instead.';
    }

    if (!/[.!?]$/.test(transcript)) {
      return `Nice sentence. In writing, finish it like this: "${this.capitalize(transcript)}."`;
    }

    return 'This is clear. Try adding one detail to make the answer sound more fluent.';
  }

  private extractMistakes(userText: string, correction: string) {
    const lower = userText.toLowerCase();
    const mistakes: Array<{
      mistake: string;
      correction: string;
      category: string;
    }> = [];

    if (lower.includes('want practice')) {
      mistakes.push({
        mistake: 'want practice',
        correction: 'want to practice',
        category: 'missing infinitive',
      });
    }

    if (lower.includes('i go beach') || lower.includes('go beach')) {
      mistakes.push({
        mistake: 'go beach',
        correction: 'go to the beach',
        category: 'missing preposition/article',
      });
    }

    if (lower.includes('yesterday i go')) {
      mistakes.push({
        mistake: 'yesterday I go',
        correction: 'yesterday I went',
        category: 'past tense',
      });
    }

    if (lower.includes('did went')) {
      mistakes.push({
        mistake: 'did went',
        correction: 'did go / went',
        category: 'verb form',
      });
    }

    if (mistakes.length === 0 && correction.includes('more natural')) {
      mistakes.push({
        mistake: userText,
        correction,
        category: 'fluency',
      });
    }

    return mistakes;
  }

  private scoreTranscript(transcript: string, correction: string) {
    const wordCount = transcript.split(' ').filter(Boolean).length;
    let score = 68 + Math.min(wordCount * 2, 20);

    if (correction.includes('more natural')) {
      score -= 8;
    }

    if (/[.!?]$/.test(transcript)) {
      score += 4;
    }

    return Math.max(45, Math.min(score, 96));
  }

  private buildReply(transcript: string, correction: string, focus: string) {
    if (!transcript) {
      return 'Let us start with a short answer in English.';
    }

    if (focus === 'Job interview') {
      return `Good answer. ${correction} In an interview, make it stronger with a result or example.`;
    }

    if (focus === 'Vocabulary') {
      return `Nice. ${correction} A useful phrase here is "to get better at" or "to improve my fluency."`;
    }

    if (focus === 'Grammar') {
      return `Good practice. ${correction} Notice the verb pattern and repeat the corrected sentence once.`;
    }

    return `Great, I understood you. ${correction}`;
  }

  private nextQuestionForFocus(focus: string) {
    if (focus === 'Job interview') {
      return 'Can you tell me about one project you are proud of?';
    }

    if (focus === 'Vocabulary') {
      return 'Can you use one new word to describe your day?';
    }

    if (focus === 'Grammar') {
      return 'Can you say the same idea in the past tense?';
    }

    return 'What did you do today, and how did it make you feel?';
  }

  private capitalize(value: string) {
    if (!value) {
      return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
