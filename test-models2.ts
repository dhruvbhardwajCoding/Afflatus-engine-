import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function testModel(modelName: string) {
  const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await aiClient.models.generateContent({
      model: modelName,
      contents: 'hello',
    });
    console.log(`[SUCCESS] ${modelName} works!`);
  } catch (err: any) {
    console.error(`[ERROR] ${modelName} failed:`, err.message);
  }
}

async function run() {
  await testModel('gemini-3.5-flash');
  await testModel('gemini-flash-latest');
  await testModel('gemini-3.8-flash');
}

run();
