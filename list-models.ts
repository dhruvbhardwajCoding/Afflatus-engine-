import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const models = await aiClient.models.list();
    console.log("Available models:");
    for await (const model of models) {
      if (model.name.includes('flash') || model.name.includes('pro')) {
        console.log(`- ${model.name}`);
      }
    }
  } catch (err: any) {
    console.error(`[ERROR] List failed:`, err.message);
  }
}

run();
