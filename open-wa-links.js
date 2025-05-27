// This script will loop through 20 device IPs and 20 WhatsApp links, and open each link on each device using ADB.
// Place this file in your project root and run with: node open-wa-links.js

const fs = require('fs');
const { exec } = require('child_process');
const axios = require('axios');

// Read WhatsApp links from a file (one per line)
const linksFile = 'wa-links.txt';
let links = [];
try {
  links = fs.readFileSync(linksFile, 'utf-8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
} catch (e) {
  console.error(`Could not read ${linksFile}:`, e.message);
  process.exit(1);
}

// List of device IPs (only one for single-device test)
const deviceIps = [
  '192.168.1.15:5555',
  '192.168.1.16:5555',
  '192.168.1.17:5555',
  '192.168.1.18:5555',
  '192.168.1.19:5555',
  '192.168.1.20:5555',
  '192.168.1.21:5555',
  '192.168.1.22:5555',
  '192.168.1.23:5555',
  '192.168.1.24:5555',
  '192.168.1.25:5555',
  '192.168.1.26:5555',
  '192.168.1.27:5555',
  '192.168.1.28:5555',
  '192.168.1.29:5555',
  '192.168.1.30:5555',
  '192.168.1.31:5555',
  '192.168.1.32:5555',
  '192.168.1.33:5555',
  '192.168.1.34:5555',
  '192.168.1.35:5555'
];

// Shuffle function
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

async function getGeminiPrompt() {
  // Replace with your Gemini API endpoint and key
  const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyD9z9INN0TuJPnKzsUdARm-FwCwgsGjlqY';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey;
  const prompt = 'please start a conversation with a random topic';
  const apiKeyLog = apiKey.length > 8 ? apiKey.slice(0, 4) + '...' + apiKey.slice(-4) : apiKey;
  fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Gemini API key used: ${apiKeyLog}\n`);
  if (!process.env.GEMINI_API_KEY) {
    fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] WARNING: Using fallback Gemini API key.\n`);
  }
  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    });
    fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Gemini API status: ${response.status}\n`);
    fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Gemini API raw response: ${JSON.stringify(response.data).slice(0, 500)}\n`);
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Gemini API returned empty or malformed response.\n`);
    }
    return text.replace(/\n/g, ' ').slice(0, 200); // Limit to 200 chars, single line
  } catch (e) {
    console.error('Gemini API error:', e.message);
    fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Gemini API error: ${e.message}\n`);
    return '';
  }
}

(async () => {
  try {
    // Remove shuffle for single device
    // shuffle(deviceIps);
    shuffle(links);

    // Loop through each device and open the corresponding link
    for (let i = 0; i < Math.min(deviceIps.length, links.length); i++) {
      const deviceIp = deviceIps[i];
      const link = links[i];
      const cmd = `adb -s ${deviceIp} shell am start -a android.intent.action.VIEW -d "${link}"`;
      console.log('Executing:', cmd);
      fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] ${cmd}\n`);
      await new Promise(resolve => {
        exec(cmd, async (error, stdout, stderr) => {
          if (error) {
            console.error(`Error on device ${deviceIp}:`, error.message);
            fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Error on device ${deviceIp}: ${error.message}\n`);
          } else {
            console.log(`Opened ${link} on ${deviceIp}`);
            fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Opened ${link} on ${deviceIp}\n`);
          }
          if (stderr) {
            console.error(`stderr for ${deviceIp}:`, stderr);
            fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] stderr for ${deviceIp}: ${stderr}\n`);
          }
          // Prompt Gemini and input text
          const geminiPromptLog = `[${new Date().toISOString()}] Prompting Gemini for device ${deviceIp} with prompt: please start a conversation with a random topic\n`;
          console.log(geminiPromptLog.trim());
          fs.appendFileSync('adb-wa-link-log.txt', geminiPromptLog);
          let geminiText = '';
          try {
            geminiText = await getGeminiPrompt();
          } catch (gerr) {
            console.error('Gemini API error:', gerr.message);
            fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Gemini API error: ${gerr.message}\n`);
          }
          if (geminiText) {
            // Escape quotes and special chars for ADB input
            const safeText = geminiText.replace(/['"\\]/g, '').replace(/\s+/g, ' ');
            const geminiResponseLog = `[${new Date().toISOString()}] Gemini response for device ${deviceIp}: ${safeText}\n`;
            console.log(geminiResponseLog.trim());
            fs.appendFileSync('adb-wa-link-log.txt', geminiResponseLog);
            const inputCmd = `adb -s ${deviceIp} shell input text "${safeText}"`;
            console.log('ADB input:', inputCmd);
            fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] ${inputCmd}\n`);
            exec(inputCmd, (inputErr, inputStdout, inputStderr) => {
              if (inputErr) {
                console.error(`ADB input error on ${deviceIp}:`, inputErr.message);
                fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] ADB input error on ${deviceIp}: ${inputErr.message}\n`);
              }
              if (inputStderr) {
                console.error(`ADB input stderr for ${deviceIp}:`, inputStderr);
                fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] ADB input stderr for ${deviceIp}: ${inputStderr}\n`);
              }
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    }
  } catch (mainErr) {
    console.error('Fatal error:', mainErr);
    fs.appendFileSync('adb-wa-link-log.txt', `[${new Date().toISOString()}] Fatal error: ${mainErr}\n`);
  }
})();
