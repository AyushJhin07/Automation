import type { Job } from 'bullmq';

declare module 'bullmq' {
  interface JobsOptions<DataType = any, ResultType = any, NameType extends string = string> {
    group?: {
      id: string;
    };
  }

  interface WorkerOptions<DataType = any, ResultType = any, NameType extends string = string> {
    group?: {
      concurrency?: number;
      limiter?: {
        groupKey?: string | ((job: Job<DataType, ResultType, NameType>) => string);
      };
    };
  }
}
