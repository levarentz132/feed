const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'adb-wa-link-log.txt');

function listAdbDevices() {
  return new Promise((resolve, reject) => {
    exec('adb devices', (error, stdout) => {
      if (error) {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Error listing devices: ${error.message}\n`);
        console.error(`[${new Date().toISOString()}] Error listing devices: ${error.message}`);
        return reject(error);
      }
      const devices = stdout.split('\n')
        .slice(1)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('*'))
        .map(line => {
          const [id, status] = line.split(/\s+/);
          return { id, status };
        });
      resolve(devices);
    });
  });
}

function runAdbCommand(deviceId, command) {
  return new Promise((resolve, reject) => {
    const cmd = `adb -s ${deviceId} shell ${command}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Error: ${error.message}\n`);
        return reject(error);
      }
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Command executed: ${cmd}\n`);
      resolve(stdout);
    });
  });
}
const keyMap = {
  'a': 29, 'b': 30, 'c': 31, 'd': 32, 'e': 33,
  'f': 34, 'g': 35, 'h': 36, 'i': 37, 'j': 38,
  'k': 39, 'l': 40, 'm': 41, 'n': 42, 'o': 43,
  'p': 44, 'q': 45, 'r': 46, 's': 47, 't': 48,
  'u': 49, 'v': 50, 'w': 51, 'x': 52, 'y': 53,
  'z': 54, '0': 7, '1': 8, '2': 9, '3': 10,
  '4': 11, '5': 12, '6': 13, '7': 14, '8': 15,
  '9': 16, ' ': 62, ',': 55, '.': 56, '/': 76,
  '@': 77, '-': 69, '_': 69, '\n': 66, '!': 8, '?': 76
};

function randomDelay(min = 80, max = 200) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomThinkingPause(min = 500, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomSendDelay(min = 1000, max = 4000) { // wait 1–4 seconds before sending
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTypoRate() {
  // Typo rate: random between 3% to 10%
  return (Math.random() * (0.1 - 0.03) + 0.03);
}

function shouldMakeMistake(typoProbability) {
  return Math.random() < typoProbability;
}

function shouldFixMistake(probability = 0.5) {
  return Math.random() < probability;
}

function isPunctuation(char) {
  return [',', '.', '?', '!'].includes(char);
}

async function typeLikeHuman(devId, text) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Original text: ${text}\n`);

  const chars = text.toLowerCase();
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] keyMap: ${JSON.stringify(keyMap)}\n`);

  const typoProbability = randomTypoRate(); // randomize typo rate for this message
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Typo rate: ${typoProbability}\n`);

  let charCount = 0;

  for (const char of chars) {
    const keyCode = keyMap[char];
    if (keyCode !== undefined) {
      
      // Mistake simulation
      if (shouldMakeMistake(typoProbability)) {
        const randomKey = Object.values(keyMap)[Math.floor(Math.random() * Object.values(keyMap).length)];
        const mistakeCmd = `input keyevent ${randomKey}`;
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Running keyevent (mistake): ${mistakeCmd}\n`);
        await runAdbCommand(devId, mistakeCmd);
        await new Promise(resolve => setTimeout(resolve, randomDelay(100, 250)));

        if (shouldFixMistake()) {
          const backspaceCmd = `input keyevent 67`;
          fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Running keyevent (backspace): ${backspaceCmd}\n`);
          await runAdbCommand(devId, backspaceCmd);
          await new Promise(resolve => setTimeout(resolve, randomDelay(100, 250)));
        }
      }

      // Typing the intended character
      const cmd = `input keyevent ${keyCode}`;
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Running keyevent: ${cmd}\n`);
      await runAdbCommand(devId, cmd);

      // Random small delay per key
      await new Promise(resolve => setTimeout(resolve, randomDelay()));

      charCount++;

      // Longer pause after punctuation
      if (isPunctuation(char)) {
        await new Promise(resolve => setTimeout(resolve, randomThinkingPause(500, 1000)));
      }

      // Every ~10–15 characters, simulate random "thinking" pause
      if (charCount % (10 + Math.floor(Math.random() * 5)) === 0) {
        await new Promise(resolve => setTimeout(resolve, randomThinkingPause(700, 1500)));
      }
    }
  }

  // Random wait before pressing ENTER
  const waitBeforeSend = randomSendDelay();
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Waiting before sending: ${waitBeforeSend} ms\n`);
  await new Promise(resolve => setTimeout(resolve, waitBeforeSend));

  await runAdbCommand(devId, 'input keyevent 66'); // Press Enter to send
}
function randomPause(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function randomScrollOrTap(devId) {
  const doScroll = Math.random() < 0.5;  // 50% chance to scroll or tap
  if (doScroll) {
    const x = 500 + Math.floor(Math.random() * 200); // center-ish x
    const yStart = 1500 + Math.floor(Math.random() * 300);
    const yEnd = 300 + Math.floor(Math.random() * 300);
    const duration = 300 + Math.floor(Math.random() * 400); // 300-700ms swipe

    const swipeCmd = `input touchscreen swipe ${x} ${yStart} ${x} ${yEnd} ${duration}`;
    await runAdbCommand(devId, swipeCmd);
  } else {
    // random tap somewhere like on blank chat area
    const tapX = 300 + Math.floor(Math.random() * 400);
    const tapY = 800 + Math.floor(Math.random() * 600);
    const tapCmd = `input tap ${tapX} ${tapY}`;
    await runAdbCommand(devId, tapCmd);
  }
}


function sanitizeAndChunkForAdbInput(input, chunkSize = 100) {
  // 1. Remove newlines and escape characters for ADB (for input keyevent, no need to escape quotes)
  let sanitizedInput = input
    .replace(/[\n\r]/g, ' ')    // Replace newlines with space (natural)
    .replace(/"/g, '')          // Remove quotes (unless you want to type quotes)
    .replace(/\\/g, '')         // Remove backslashes (not needed for typing)
    .trim();

  // 2. Remove non-ASCII characters (optional)
  sanitizedInput = sanitizedInput.replace(/[^\x00-\x7F]/g, '');

  // 3. Chunk if needed
  const chunks = [];
  for (let i = 0; i < sanitizedInput.length; i += chunkSize) {
    chunks.push(sanitizedInput.substring(i, i + chunkSize));
  }

  return chunks;
}


function runCommandFileOnDevice(filename, deviceId) {
  const COMMANDS_DIR = path.join(__dirname, 'commands');
  const filePath = path.join(COMMANDS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Command file ${filename} does not exist.`);
  }

  const commands = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const results = [];

  for (const command of commands) {
    const cmd = `adb -s ${deviceId} shell ${command}`;
    try {
      execSync(cmd);
      results.push({ command: cmd, success: true });
    } catch (error) {
      results.push({ command: cmd, success: false, error: error.message });
    }
  }

  return results;
}

module.exports = {
  listAdbDevices,
  runAdbCommand,
  sanitizeAndChunkForAdbInput,
  runCommandFileOnDevice,
  typeLikeHuman,
  randomPause,
  randomScrollOrTap
};
