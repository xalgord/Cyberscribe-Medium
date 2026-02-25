const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = 'AIzaSyBjU2p32KfFP3nk0Vw4XnufVz37dJSkMH8';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function listModels() {
    try {
        console.log('Fetching models...');
        const response = await ai.models.list();
        // The SDK structure might be different, let's try to log the raw response or iterate
        // Based on @google/genai docs, it might return an async iterable or a list

        // Attempt standard listing if specific method exists, otherwise use generic request
        // But specific SDK usually helps. 
        // Let's try to just log what we get.

        // In @google/genai 0.1.x, usage is ai.models.list()
        // It returns a response object with .models property

        for await (const model of response) {
            console.log(`- ${model.name} (${model.displayName})`);
            console.log(`  Supported generation methods: ${model.supportedGenerationMethods}`);
        }

    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
