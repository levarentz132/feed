const express = require('express');
const { listAdbDevices, runAdbCommand, sanitizeAndChunkForAdbInput, runCommandFileOnDevice, typeLikeHuman, randomPause,
  randomScrollOrTap } = require('./adb-utils.cjs');
const { getGeminiPrompt } = require('./gemini-api.cjs');
const { loadWhatsAppLinks, logMessage, readCommandFile } = require('./file-utils.cjs');

const router = express.Router();

// Load WhatsApp links
const waLinks = loadWhatsAppLinks();
let endlessJobHandle = null;   // holds the async loop Promise
let endlessShouldRun  = false;
router.get('/adb-devices', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Received request for /adb-devices`); // Log incoming request
  try {
    const devices = await listAdbDevices();
    res.json(devices);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching devices: ${error.message}`); // Log error
    res.status(500).json({ error: error.message });
  }
});

router.post('/open-wa-link', async (req, res) => {
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

router.post('/start', async (req, res) => {
  try {
    const { restMinutes, deviceId, topic, language, toggle } = req.body;
    console.log(restMinutes, toggle);
    /* ---------- basic validation ---------- */
    if (!topic || !language) {
      return res.status(400).json({ error: 'Missing topic or language' });
    }
    let deviceIds = Array.isArray(deviceId) ? deviceId : [deviceId];
    deviceIds = [...new Set(deviceIds.map(String))]
      .filter(id => /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/.test(id));
    if (!deviceIds.length) {
      return res.status(400).json({ error: 'No valid device IDs' });
    }
    if (!waLinks?.length) {
      return res.status(400).json({ error: 'No WhatsApp links available' });
    }

    /* --- shuffle links once, then treat as ring-buffer --- */
    const linkRing = [...waLinks].sort(() => Math.random() - 0.5);
    let linkPtr   = 0;
    const nextLink = () => {
      const link = linkRing[linkPtr];
      linkPtr = (linkPtr + 1) % linkRing.length;   // cycle forever
      return link;
    };

    /* ---------- background loop ---------- */
    if (endlessJobHandle) {
      return res.json({ running: true, message: 'Loop already active' });
    }
    endlessShouldRun = true;

    const restMs = restMinutes * 60 * 1000;
    const runEndless = async () => {
      while (endlessShouldRun) {
        for (const devId of deviceIds) {
          try {
            const link = nextLink();
            logMessage(`▶️ ${devId} → ${link}`);

            /* main flow */
            await runAdbCommand(devId, `am start -a android.intent.action.VIEW -d "${link}"`);
            await new Promise(resolve => setTimeout(resolve, randomPause(1500, 4000))); // human delay 1.5–4s
            await randomScrollOrTap(devId); // 50% scroll or tap

            const geminiText = await getGeminiPrompt(language, topic);
            for (const chunk of sanitizeAndChunkForAdbInput(geminiText)) {
              await typeLikeHuman(devId, `"${chunk}"`);
            }
            await new Promise(resolve => setTimeout(resolve, randomPause(1000, 4000))); // wait before sending
            await runAdbCommand(devId, 'input keyevent 66'); // Press Enter key

            if (toggle === 'reply') {
              await runCommandFileOnDevice('example1.txt', devId);
              for (const chunk of sanitizeAndChunkForAdbInput(geminiText)) {
              await typeLikeHuman(devId, `"${chunk}"`);
              }
              await runAdbCommand(devId, 'input keyevent 66'); // Press Enter key
              await runAdbCommand(devId, 'input keyevent 3');  // Press Home key
            } else if (toggle === 'image') {
              await runCommandFileOnDevice('example2.txt', devId);
              await runAdbCommand(devId, 'input keyevent 3');  // Press Home key
            }
          } catch (err) {
            logMessage(`❌ ${devId} error: ${err.message}`);
          }
        }
        /* wait before next FULL round */
        await new Promise(r => setTimeout(r, restMs));
      }
      endlessJobHandle = null;                // loop exited
      logMessage('🛑 Endless loop stopped');
    };

    endlessJobHandle = runEndless();          // fire, don’t await
    res.json({ running: true, message: 'Endless loop started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/stop', (_req, res) => {
  if (!endlessJobHandle) {
    return res.json({ running: false, message: 'No loop active' });
  }
  endlessShouldRun = false;       // the while-loop will exit after current pass
  res.json({ running: false, message: 'Stop signal sent' });
});



module.exports = router;
