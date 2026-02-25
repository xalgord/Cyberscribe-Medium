require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testModel(modelName) {
  try {
    const model = ai.getGenerativeModel({ model: modelName });
    const res = await model.generateContent("Hello");
    console.log(`✅ ${modelName} works`);
  } catch (e) {
    console.log(`❌ ${modelName} failed: ${e.message}`);
  }
}

async function run() {
  await testModel('gemini-1.5-flash');
  await testModel('gemini-1.5-flash-latest');
  await testModel('gemini-pro');
  await testModel('gemini-1.5-pro');
  await testModel('gemini-2.5-flash');
  await testModel('gemini-2.5-flash-image');
}
run();
