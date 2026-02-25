const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = 'AIzaSyBjU2p32KfFP3nk0Vw4XnufVz37dJSkMH8';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function testSearch() {
    const url = 'https://hackerone.com/reports/2459922';
    console.log('Testing search for:', url);

    try {
        const model = ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: `Use Google Search to read the full details of this HackerOne report: ${url}. Provide a detailed summary of the vulnerability, impact, and remediation.` }
                    ]
                }
            ],
            tools: [
                { googleSearch: {} }
            ]
        });

        const result = await model;
        console.log('Result:', result.response.text());

        // Check if grounding metadata exists
        if (result.response.candidates[0].groundingMetadata) {
            console.log('Grounding Metadata:', JSON.stringify(result.response.candidates[0].groundingMetadata, null, 2));
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

testSearch();
