import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EngagementService } from './engagement.service';

const DEFAULT_INTERVAL_MINUTES = 60;
const INITIAL_DELAY_MS = 30_000; // let the DB connection settle after boot

/**
 * Periodically rolls the ToolEvent log up into ToolStat so trending/rankings
 * stay fresh as engagement accumulates. Mirrors the dependency-free
 * self-rescheduling timer pattern used by NewsSchedulerService.
 *
 * Env:
 *   ENABLE_STATS_SCHEDULER=false            -> disable in-app scheduling
 *                                              (e.g. when using an external cron)
 *   STATS_RECOMPUTE_INTERVAL_MINUTES=<n>    -> override the 60-minute cadence
 */
@Injectable()
export class StatsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly engagementService: EngagementService) {}

  onModuleInit() {
    if (process.env.ENABLE_STATS_SCHEDULER === 'false') {
      this.logger.log('Stats recompute scheduler disabled (ENABLE_STATS_SCHEDULER=false).');
      return;
    }

    this.logger.log(
      `Stats recompute scheduler enabled (every ${this.getIntervalMinutes()} min).`,
    );
    this.scheduleNext(INITIAL_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private getIntervalMinutes(): number {
    const raw = Number(process.env.STATS_RECOMPUTE_INTERVAL_MINUTES);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MINUTES;
  }

  private scheduleNext(delayMs: number) {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.run();
    }, delayMs);
  }

  private async run() {
    if (this.running) {
      this.scheduleNext(this.getIntervalMinutes() * 60_000);
      return;
    }

    this.running = true;
    try {
      const result = await this.engagementService.recomputeStats();
      this.logger.log(`Recomputed ToolStat for ${result.toolsUpdated} tool(s).`);
    } catch (error) {
      this.logger.warn(
        `Stats recompute failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      this.running = false;
      this.scheduleNext(this.getIntervalMinutes() * 60_000);
    }
  }
}
