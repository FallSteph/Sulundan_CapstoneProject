const crypto = require("crypto");
const { connection: redis } = require("./queue");

const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds

/**
 * Computes SHA256 hash of a file buffer
 * @param {Buffer} buffer File buffer
 * @returns {string} SHA256 hash
 */
function computeFileHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Gets cached AI analysis result
 * @param {string} fileHash SHA256 hash of the file
 * @param {string} type Analysis type: "ai" or "table"
 */
async function getCachedResult(fileHash, type = "ai") {
  const key = `cache:${type}:${fileHash}`;
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

/**
 * Stores AI analysis result in Redis cache
 * @param {string} fileHash SHA256 hash of the file
 * @param {any} result Analysis result to cache
 * @param {string} type Analysis type: "ai" or "table"
 */
async function setCachedResult(fileHash, result, type = "ai") {
  const key = `cache:${type}:${fileHash}`;
  await redis.setex(key, CACHE_TTL, JSON.stringify(result));
}

module.exports = {
  computeFileHash,
  getCachedResult,
  setCachedResult,
};
