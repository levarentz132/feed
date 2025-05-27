const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'adb-wa-link-log.txt');

async function getGeminiPrompt(language, topic) {
  const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyD9z9INN0TuJPnKzsUdARm-FwCwgsGjlqY';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const prompt = `Buat pembukaan percakapan dalam bahasa ${language} tentang topik: ${topic}. langsung mulai percakapan dengan pesan yang relevan. berikan pesan yang singkat sperti chat dengan teman sendiri.`;

  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Gemini API URL: ${url}\n`);

  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Gemini API status: ${response.status}\n`);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Gemini API raw response: ${JSON.stringify(response.data).slice(0, 500)}\n`);
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.replace(/\n/g, ' ').slice(0, 200);
  } catch (error) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Gemini API error: ${error.message}\n`);
    return '';
  }
}

module.exports = {
  getGeminiPrompt
};
