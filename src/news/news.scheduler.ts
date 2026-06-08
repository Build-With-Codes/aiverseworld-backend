import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NewsService } from './news.service';

const INDIA_TIME_ZONE = 'Asia/Kolkata';
const INDIA_RUN_HOURS = [0, 12];

@Injectable()
export class NewsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly newsService: NewsService) {}

  onModuleInit() {
    this.scheduleNextRun();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextRun() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = new Date();
    const nextRun = this.getNextIndiaRun(now);
    const delay = Math.max(nextRun.getTime() - now.getTime(), 1000);

    this.logger.log(
      `Cron job scheduled for ${nextRun.toISOString()} (${INDIA_TIME_ZONE} ${this.formatIndiaDate(nextRun)})`,
    );

    this.timer = setTimeout(async () => {
      await this.runScheduledRefresh();
      this.scheduleNextRun();
    }, delay);
  }

  private async runScheduledRefresh() {
    this.logger.log('Cron job started');

    try {
      await this.newsService.refreshArticles({
        trigger: 'cron',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown scheduled refresh error';
      this.logger.error(`Cron job failed: ${message}`);
    }
  }

  private getNextIndiaRun(now: Date) {
    const todayIndia = this.getIndiaParts(now);

    for (const hour of INDIA_RUN_HOURS) {
      const candidate = this.createUtcDateFromIndiaParts(
        todayIndia.year,
        todayIndia.month,
        todayIndia.day,
        hour,
        0,
        0,
      );

      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    }

    const tomorrowBase = this.createUtcDateFromIndiaParts(
      todayIndia.year,
      todayIndia.month,
      todayIndia.day + 1,
      0,
      0,
      0,
    );
    const tomorrowIndia = this.getIndiaParts(tomorrowBase);

    return this.createUtcDateFromIndiaParts(
      tomorrowIndia.year,
      tomorrowIndia.month,
      tomorrowIndia.day,
      INDIA_RUN_HOURS[0],
      0,
      0,
    );
  }

  private getIndiaParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: INDIA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');

    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
      second: get('second'),
    };
  }

  private createUtcDateFromIndiaParts(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ) {
    const indiaOffsetMinutes = 5.5 * 60;
    return new Date(
      Date.UTC(year, month - 1, day, hour, minute, second) -
        indiaOffsetMinutes * 60 * 1000,
    );
  }

  private formatIndiaDate(date: Date) {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: INDIA_TIME_ZONE,
      dateStyle: 'medium',
      timeStyle: 'medium',
      hour12: true,
    }).format(date);
  }
}
