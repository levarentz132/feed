const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'adb-wa-link-log.txt');

function listAdbDevices() {
  return new Promise((resolve, reject) => {
    exec('adb devices', (error, stdout) => {
      if (error) {
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

function sanitizeAndChunkForAdbInput(input, chunkSize) {
  const sanitizedInput = input
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '%s')
    .trim();

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
};
