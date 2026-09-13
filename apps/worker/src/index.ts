import { Worker } from "bullmq";
import { SMOKE_QUEUE } from "@trading-bolt/shared";

const REDIS_URL = process.env.REDIS_URL;

function log(level: "info" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

if (!REDIS_URL) {
  log("error", "WORKER_INVALID_ENV", { error: "REDIS_URL is required" });
  process.exit(1);
}

const worker = new Worker(
  SMOKE_QUEUE,
  async (job) => {
    log("info", "JOB_PROCESSING", { queue: SMOKE_QUEUE, jobId: job.id, data: job.data });
    return { queue: SMOKE_QUEUE, jobId: job.id, processedAt: new Date().toISOString() };
  },
  { connection: { url: REDIS_URL } },
);

worker.on("ready", () => {
  log("info", "WORKER_READY", { queue: SMOKE_QUEUE });
});

worker.on("error", (error) => {
  log("error", "WORKER_ERROR", { error: error.message });
});

worker.on("failed", (job, error) => {
  log("error", "JOB_FAILED", { jobId: job?.id, error: error.message });
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log("info", "WORKER_SHUTDOWN_START", { signal });
  try {
    await worker.close();
    log("info", "WORKER_SHUTDOWN_COMPLETE", {});
    process.exit(0);
  } catch (error) {
    log("error", "WORKER_SHUTDOWN_ERROR", { error: (error as Error).message });
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
