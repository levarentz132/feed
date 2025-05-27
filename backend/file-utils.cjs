const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'adb-wa-link-log.txt');
const COMMANDS_DIR = path.join(__dirname, 'commands');

function loadWhatsAppLinks() {
  const waLinksPath = path.join(__dirname, 'wa-links.txt');
  if (fs.existsSync(waLinksPath)) {
    const links = fs.readFileSync(waLinksPath, 'utf8').split(/\r?\n/).filter(Boolean);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Loaded ${links.length} WhatsApp links\n`);
    return links;
  } else {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] wa-links.txt not found\n`);
    return [];
  }
}

function logMessage(message) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

function readCommandFile(filename) {
  const filePath = path.join(COMMANDS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Command file ${filename} does not exist.`);
  }
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
}

module.exports = {
  loadWhatsAppLinks,
  logMessage,
  readCommandFile,
};
