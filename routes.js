const express = require('express');
const { listAdbDevices, runAdbCommand, sanitizeAndChunkForAdbInput, runCommandFileOnDevice } = require('./adb-utils');
const { getGeminiPrompt } = require('./gemini-api');
const { loadWhatsAppLinks, logMessage, readCommandFile } = require('./file-utils');

const router = express.Router();

// Load WhatsApp links
const waLinks = loadWhatsAppLinks();

router.get('/api/adb-devices', async (req, res) => {
  try {
    const devices = await listAdbDevices();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/open-wa-link', async (req, res) => {
  const { deviceIds, links } = req.body;
  if (!Array.isArray(deviceIds) || !Array.isArray(links) || deviceIds.length === 0 || links.length === 0) {
    return res.status(400).json({ error: 'deviceIds and links must be non-empty arrays' });
  }

  const results = [];
  for (let i = 0; i < deviceIds.length; i++) {
    const deviceId = deviceIds[i];
    const link = links[i % links.length];
    try {
      await runAdbCommand(deviceId, `am start -a android.intent.action.VIEW -d "${link}"`);
      logMessage(`Opened ${link} on ${deviceId}`);
      results.push({ deviceId, link, success: true });
    } catch (error) {
      results.push({ deviceId, link, success: false, error: error.message });
    }
  }

  res.json({ results });
});

router.post('/api/start', async (req, res) => {
  try {
    const { restMinutes, deviceId, topic, language } = req.body;
    const intervalMs = (restMinutes || 10) * 60 * 1000;

    if (!topic || !language || !deviceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!waLinks || waLinks.length === 0) {
      return res.status(400).json({ error: 'No WhatsApp links available' });
    }

    const usedLinks = new Set();

    for (let i = 0; i < 3; i++) {
      const availableLinks = waLinks.filter(link => !usedLinks.has(link));
      if (availableLinks.length === 0) {
        return res.status(400).json({ error: 'No more unique links available' });
      }

      const link = availableLinks[Math.floor(Math.random() * availableLinks.length)];
      usedLinks.add(link);
      logMessage(`Processing deviceId: ${deviceId} with link: ${link}`);

      const geminiText = await getGeminiPrompt(language, topic);
      logMessage(`Gemini response: ${geminiText}`);

      await runCommandFileOnDevice('example1.txt', deviceId);
      if (i < 2) await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    res.json({ success: true });
  } catch (error) {
    logMessage(`Error in start flow: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
