const { Queue } = require("bullmq");
const IORedis = require("ioredis");

// Redis connection configuration
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT) || 6379;

// Initialize Redis connection
const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Create queues
const aiAnalysisQueue = new Queue("ai-analysis", { connection });
const tableAnalysisQueue = new Queue("table-analysis", { connection });

module.exports = {
  aiAnalysisQueue,
  tableAnalysisQueue,
  connection,
};
