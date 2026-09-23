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
    console.log(`[SUCCESS] ${modelName} works! Response: ${res.text}`);
  } catch (err: any) {
    console.error(`[ERROR] ${modelName} failed:`, err.message);
  }
}

async function run() {
  await testModel('gemini-1.5-flash');
  await testModel('gemini-2.5-flash');
  await testModel('gemini-3.6-flash');
  await testModel('gemini-2.0-flash');
}

run();
