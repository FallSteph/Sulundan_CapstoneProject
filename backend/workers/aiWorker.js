const { Worker } = require("bullmq");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const fetch = require("node-fetch");
const { connection } = require("../utils/queue");

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

console.log("Starting AI analysis worker...");

// Worker for AI Analysis tasks (from /ai/analyze)
const aiAnalysisWorker = new Worker(
  "ai-analysis",
  async (job) => {
    try {
      console.log(`Processing AI analysis job ${job.id}...`);
      const { filePath, originalname, options } = job.data;

      // Call the /ai/analyze endpoint's logic here
      // (We'll implement file upload and processing similar to what's in ai.js routes)
      // But wait, let's check the original ai.js route to replicate it exactly!
      console.log(`File: ${filePath}, options:`, options);

      // TODO: Implement the actual AI analysis processing here,
      // exactly as it was in the ai.js routes!
      // For now, return a placeholder, and we'll fill it in after checking ai.js!

      return {
        success: true,
        message: "AI analysis completed successfully",
        data: {}, // We'll update this once we integrate the actual processing!
      };
    } catch (error) {
      console.error(`AI analysis job ${job.id} failed:`, error);
      throw error;
    }
  },
  { connection }
);

// Worker for Table Analysis tasks (from /ai/analyze-table)
const tableAnalysisWorker = new Worker(
  "table-analysis",
  async (job) => {
    try {
      console.log(`Processing table analysis job ${job.id}...`);
      const { filePath, originalname } = job.data;

      const formData = new FormData();
      formData.append("file", fs.createReadStream(filePath), { filename: originalname });

      const response = await fetch(`${PYTHON_SERVICE_URL}/analyze-table`, {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const errMsg = await response.text();
        console.error("Python service failed:", errMsg);
        throw new Error(`Python service failed: ${errMsg}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`Table analysis job ${job.id} failed:`, error);
      throw error;
    }
  },
  { connection }
);

// Error handling
aiAnalysisWorker.on("failed", (job, err) => {
  console.error(`AI analysis job ${job?.id} failed:`, err.message);
});

tableAnalysisWorker.on("failed", (job, err) => {
  console.error(`Table analysis job ${job?.id} failed:`, err.message);
});

console.log("AI and Table analysis workers are running!");
