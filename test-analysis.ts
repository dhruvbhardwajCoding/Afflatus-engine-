import { CollaborationAnalysisService } from './server/services/collaborationAnalysisService';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('Testing CollaborationAnalysisService...');
  console.log('GEMINI_API_KEY is:', process.env.GEMINI_API_KEY ? 'Set' : 'Not Set');
  const answers = {
    scenario_q1: "I would listen to them but ultimately I do what I want.",
    scenario_q2: "I cry.",
    scenario_q3: "I work harder.",
    scenario_q4: "Prefer clear direction and execute it",
    scenario_q5: "Being nice."
  };
  const result = await CollaborationAnalysisService.analyzeAnswers(answers);
  console.log('Result:', JSON.stringify(result, null, 2));
}

run().catch(console.error);
