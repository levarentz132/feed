<script setup>
import { ref, onMounted } from 'vue'

const devices = ref([])
const loading = ref(true)
const error = ref(null)
const waLinks = ref([])
const logs = ref([])
const assignLoading = ref(false)
const sendEnterAfterInput = ref(true)
const replyMessage1Recent = ref(true)
const runExampleLoading = ref(false)
const schedulerSettings = ref({
  restMinutes: 10, // Ensure this has a valid default value
  language: 'Indonesia',
  topic: '', // Default topic is empty, user must input it
})
const schedulerStatus = ref({ isActive: false, currentConversation: 0 })
const schedulerLoading = ref(false)
const enabledDevices = ref(new Set()); // Track enabled devices
const example2Enabled = ref(true); // Toggle state for example2.txt
const allDevicesEnabled = ref(false); // Toggle state for enabling all devices

async function loadWaLinks() {
  try {
    const res = await fetch('/wa-links.txt')
    if (!res.ok) throw new Error('Failed to load wa-links.txt')
    const text = await res.text()
    waLinks.value = text.split(/\r?\n/).filter(Boolean)
  } catch (e) {
    logs.value.push(`[${new Date().toLocaleTimeString()}] Error loading wa-links.txt: ${e.message}`)
  }
}

function addLog(msg) {
  logs.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
  if (logs.value.length > 200) logs.value.shift()
}

async function fetchDevices() {
  loading.value = true
  error.value = null
  try {
    const res = await fetch('http://localhost:3001/api/adb-devices')
    if (!res.ok) throw new Error('Failed to fetch devices')
    devices.value = await res.json()
    addLog('Fetched devices successfully.')
  } catch (e) {
    error.value = e.message
    addLog('Error fetching devices: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function runExample1OnAllDevices() {
  runExampleLoading.value = true
  addLog('Running example1.txt on all devices...')
  try {
    const deviceIds = devices.value.map(d => d.id)
    const res = await fetch('http://localhost:3001/api/run-command-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'example1.txt', deviceIds })
    })
    if (!res.ok) throw new Error('Failed to run example1.txt')
    const data = await res.json()
    data.results.forEach(r => {
      if (r.success) {
        addLog(`Ran '${r.command}' on ${r.deviceId}`)
      } else {
        addLog(`Error running '${r.command}' on ${r.deviceId}: ${r.error || r.stderr}`)
      }
    })
  } catch (e) {
    addLog('Error: ' + e.message)
  }
  runExampleLoading.value = false
  addLog('example1.txt finished on all devices.')
}

async function runExample2OnEnabledDevices() {
  if (enabledDevices.value.size === 0) {
    addLog('No devices enabled. Please enable at least one device.');
    return;
  }
  addLog('Running example2.txt on enabled devices...');
  try {
    const deviceIds = getEnabledDeviceIds();
    const res = await fetch('http://localhost:3001/api/run-command-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'example2.txt', deviceIds })
    });
    if (!res.ok) throw new Error('Failed to run example2.txt');
    addLog('example2.txt command sent.');
  } catch (e) {
    addLog('Error: ' + e.message);
  }
}

async function fetchEnterToggle() {
  // No GET endpoint, so just assume true on load
  sendEnterAfterInput.value = true
}

async function toggleEnter() {
  const newValue = !sendEnterAfterInput.value
  const res = await fetch('http://localhost:3001/api/toggle-enter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: newValue })
  })
  if (res.ok) {
    const data = await res.json()
    sendEnterAfterInput.value = data.sendEnterAfterInput
    addLog('Toggled Enter after input: ' + (data.sendEnterAfterInput ? 'ON' : 'OFF'))
  } else {
    addLog('Failed to toggle Enter after input')
  }
}

async function fetchReplyMessage1Recent() {
  // Try to get the current value from the backend
  try {
    // Use a GET endpoint to fetch the current value
    const res = await fetch('http://localhost:3001/api/reply-message-1recent-status')
    if (res.ok) {
      const data = await res.json()
      replyMessage1Recent.value = data.replyMessage1Recent
    }
  } catch (e) {
    // fallback: do nothing
  }
}

async function toggleReplyMessage1Recent() {
  if (!replyMessage1Recent.value) {
    replyMessage1Recent.value = true;
    example2Enabled.value = false; // Automatically disable example2Enabled
    addLog('Reply Message 1recent enabled. Enabled Image disabled.');
  } else {
    replyMessage1Recent.value = false;
    addLog('Reply Message 1recent disabled.');
  }
}

async function fetchSchedulerStatus() {
  const res = await fetch('http://localhost:3001/api/stop')
  if (res.ok) {
    const data = await res.json()
    schedulerStatus.value.isActive = !!data.isFlowRunning;
    schedulerSettings.value = {
      restMinutes: data.scheduler.restMinutes,
      language: data.scheduler.language,
      topic: data.scheduler.topic,
    }
  }
}

async function updateSchedulerSettings() {
  schedulerLoading.value = true;
  await fetch('http://localhost:3001/api/scheduler/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restMinutes: schedulerSettings.restMinutes,
      language: schedulerSettings.language,
      topic: schedulerSettings.topic
    })
  });
  await fetchSchedulerStatus();
  schedulerLoading.value = false;
  addLog('Scheduler settings updated.');
}

async function startScheduler() {
  schedulerLoading.value = true;
  let restMinutes = Number(schedulerSettings.value.restMinutes);
  if (!restMinutes || isNaN(restMinutes) || restMinutes <= 0) {
    restMinutes = 10;
    schedulerSettings.value.restMinutes = 10;
    addLog('Rest minutes invalid or empty, defaulting to 10.');
  }
  const enabledIds = getEnabledDeviceIds();
  if (enabledIds.length === 0) {
    addLog('No devices enabled. Please enable at least one device.');
    schedulerLoading.value = false;
    return;
  }

  // Randomize the WhatsApp links and pair each device with one link
  const randomizedLinks = [...waLinks.value].sort(() => Math.random() - 0.5);
  const deviceLinkPairs = enabledIds.map((deviceId, index) => ({
    deviceId,
    link: randomizedLinks[index % randomizedLinks.length]
  }));

  console.log('Scheduler Device-Link Pairs:', deviceLinkPairs); // Debug log
  addLog('Starting scheduler with user inputs...');

  try {
    // Process each device
    for (const { deviceId, link } of deviceLinkPairs) {
      // Step 1: Prompt Gemini for chat
      addLog(`Opening link ${link} on device ${deviceId}...`);
      await fetch('http://localhost:3001/api/open-wa-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds: [deviceId], links: [link] })
      });
      addLog(`Prompting chat on device ${deviceId}...`);
      await fetch('http://localhost:3001/api/prompt-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, language: schedulerSettings.value.language, topic: schedulerSettings.value.topic })
      });

      // Step 2: Run either example1.txt or example2.txt
      if (replyMessage1Recent.value && example2Enabled.value) {
        const randomChoice = Math.random() < 0.5 ? 'example1.txt' : 'example2.txt';
        addLog(`Running ${randomChoice} on device ${deviceId}...`);
        await fetch('http://localhost:3001/api/run-command-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: randomChoice, deviceIds: [deviceId] })
        });
      } else if (replyMessage1Recent.value) {
        addLog(`Running example1.txt on device ${deviceId}...`);
        await fetch('http://localhost:3001/api/run-command-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'example1.txt', deviceIds: [deviceId] })
        });
      } else if (example2Enabled.value) {
        addLog(`Running example2.txt on device ${deviceId}...`);
        await fetch('http://localhost:3001/api/run-command-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'example2.txt', deviceIds: [deviceId] })
        });
      }
    }

    addLog('Scheduler completed successfully.');
  } catch (e) {
    addLog('Error during scheduler execution: ' + e.message);
  }
  schedulerLoading.value = false;
}

async function stopScheduler() {
  schedulerLoading.value = true
  await fetch('http://localhost:3001/api/stop', { method: 'POST' })
  addLog('Scheduler stopped.')
  await fetchSchedulerStatus()
  schedulerLoading.value = false
}

function toggleDevice(deviceId) {
  if (enabledDevices.value.has(deviceId)) {
    enabledDevices.value.delete(deviceId);
    addLog(`Device ${deviceId} disabled.`);
  } else {
    enabledDevices.value.add(deviceId);
    addLog(`Device ${deviceId} enabled.`);
  }
}

function toggleExample2Enabled() {
  if (!example2Enabled.value) {
    example2Enabled.value = true;
    replyMessage1Recent.value = false; // Automatically disable replyMessage1Recent
    addLog('Enabled Image enabled. Reply Message 1recent disabled.');
  } else {
    example2Enabled.value = false;
    addLog('Enabled Image disabled.');
  }
}

function toggleAllDevices() {
  allDevicesEnabled.value = !allDevicesEnabled.value;
  if (allDevicesEnabled.value) {
    devices.value.forEach(device => enabledDevices.value.add(device.id));
    addLog('All devices enabled.');
  } else {
    enabledDevices.value.clear();
    addLog('All devices disabled.');
  }
}

function getEnabledDeviceIds() {
  return Array.from(enabledDevices.value);
}

async function startFlow() {
  schedulerLoading.value = true;
  try {
    const enabledIds = Array.from(enabledDevices.value);
    let toggle = null;
    if (example2Enabled.value) {
      toggle = "image";
    } else if (replyMessage1Recent.value) {
      toggle = "reply";
    }
    const res = await fetch('http://localhost:3001/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restMinutes: schedulerSettings.value.restMinutes,
        deviceId: enabledIds,
        topic: schedulerSettings.value.topic,
        language: schedulerSettings.value.language,
        toggle, // send toggle value
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to start flow');
    }

    addLog('Flow started successfully.');
  } catch (e) {
    addLog('Error starting flow: ' + e.message);
  } finally {
    schedulerLoading.value = false;
  }
}

async function openWaLink() {
  assignLoading.value = true;
  try {
    const res = await fetch('http://localhost:3001/api/open-wa-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceIds: Array.from(enabledDevices.value),
        links: waLinks.value,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to open WhatsApp links');
    }

    addLog('WhatsApp links opened successfully.');
  } catch (e) {
    addLog('Error opening WhatsApp links: ' + e.message);
  } finally {
    assignLoading.value = false;
  }
}

onMounted(() => {
  loadWaLinks();
  fetchDevices();
  fetchEnterToggle();
  fetchReplyMessage1Recent();
  fetchSchedulerStatus();

  // Set both toggles to off during initial load
  replyMessage1Recent.value = false;
  example2Enabled.value = false;
});
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="./assets/logo.svg" width="125" height="125" />
    <div class="wrapper">
      <h1>ADB Device Manager</h1>
    </div>
  </header>
  <main>
    <div class="controls">
      <button @click="fetchDevices">🔄 Refresh Devices</button>
      <button @click="toggleEnter" :class="sendEnterAfterInput ? 'on' : 'off'">
        {{ sendEnterAfterInput ? '⏎ Enter After Input: ON' : '⏎ Enter After Input: OFF' }}
      </button>
      <button @click="toggleReplyMessage1Recent" :class="replyMessage1Recent ? 'on' : 'off'">
        {{ replyMessage1Recent ? '💬 Reply Message 1recent: ON' : '💬 Reply Message 1recent: OFF' }}
      </button>
      <button @click="toggleExample2Enabled" :class="example2Enabled ? 'on' : 'off'">
        {{ example2Enabled ? 'Enabled Image: ON' : 'Enabled Image: OFF' }}
      </button>
      <button @click="toggleAllDevices" :class="allDevicesEnabled ? 'on' : 'off'">
        {{ allDevicesEnabled ? 'Disable All Devices' : 'Enable All Devices' }}
      </button>
    </div>
    <section class="scheduler-section">
      <h2>🕒 Conversation Scheduler</h2>
      <form @submit.prevent="startScheduler" class="scheduler-form">
        <div class="scheduler-fields">
          <div class="scheduler-group">
            <label title="How long to rest between loops (in minutes)">Rest (min):</label>
            <input type="number" v-model.number="schedulerSettings.restMinutes" min="1" style="width:60px" />
          </div>
          <div class="scheduler-group">
            <label title="Language for Gemini conversation starter">Language:</label>
            <input type="text" v-model="schedulerSettings.language" style="width:120px" />
          </div>
          <div class="scheduler-group">
            <label title="Topic for Gemini conversation starter">Topic:</label>
            <input type="text" v-model="schedulerSettings.topic" style="width:200px" />
          </div>
        </div>
        <button type="submit" class="start-btn" @click.prevent="startFlow">▶️ Start</button>
      </form>
      <div class="scheduler-status">
        <div>Status: <b :class="schedulerStatus.isActive ? 'on' : 'off'">{{ schedulerStatus.isActive ? 'Running' : 'Stopped' }}</b></div>
        <div class="scheduler-btns">
          <button @click="stopScheduler" class="stop-btn">⏹️ Stop</button>
        </div>
      </div>
    </section>
    <div v-if="loading">Loading devices...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="main-flex">
        <div class="log-box left">
          <h3>Log</h3>
          <textarea readonly rows="18" :value="logs.join('\n')"></textarea>
        </div>
        <div class="table-box">
          <h2>Devices</h2>
          <table class="device-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Enable</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in devices" :key="d.id">
                <td><span class="device-id">{{ d.id }}</span></td>
                <td>
                  <span :class="['status', d.status]">
                    {{ d.status }}
                  </span>
                </td>
                <td>
                  <button @click="toggleDevice(d.id)" :class="enabledDevices.has(d.id) ? 'on' : 'off'">
                    {{ enabledDevices.has(d.id) ? 'ON' : 'OFF' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}
.logo {
  display: block;
  margin: 0 auto 2rem;
}
.wrapper {
  text-align: center;
}
.controls {
  margin-bottom: 1rem;
  display: flex;
  gap: 1rem;
  justify-content: center;
}
.scheduler-section {
  margin: 2rem auto 1rem auto;
  padding: 1.5rem 2.5rem;
  background:rgb(60, 71, 62);
  border-radius: 0.7em;
  max-width: 750px;
  box-shadow: 0 2px 12px #0002;
  border: 1px solid #e0e0e0;
}
.scheduler-form {
  display: flex;
  flex-wrap: wrap;
  gap: 1.2rem;
  align-items: center;
  margin-bottom: 0.7rem;
  justify-content: flex-start;
}
.scheduler-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
}
.scheduler-group {
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  min-width: 160px;
}
.scheduler-group label {
  font-weight: 500;
  margin-bottom: 0.1em;
}
.save-btn {
  background: #42b983;
  color: white;
  border: none;
  border-radius: 0.3em;
  padding: 0.5em 1.2em;
  font-size: 1em;
  cursor: pointer;
  margin-left: 1.5em;
  transition: background 0.2s;
}
.save-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.scheduler-status {
  display: flex;
  flex-wrap: wrap;
  gap: 2.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
  margin-top: 0.7rem;
}
.progress-bar-bg {
  width: 180px;
  height: 12px;
  background: #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
  margin-top: 0.2em;
}
.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #42b983 60%, #2c3e50 100%);
  border-radius: 6px;
  transition: width 0.4s;
}
.scheduler-btns {
  display: flex;
  gap: 1.2em;
}
.start-btn {
  background: #42b983;
  color: white;
  border: none;
  border-radius: 0.3em;
  padding: 0.5em 1.5em;
  font-size: 1em;
  cursor: pointer;
  transition: background 0.2s;
}
.start-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.stop-btn {
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 0.3em;
  padding: 0.5em 1.5em;
  font-size: 1em;
  cursor: pointer;
  transition: background 0.2s;
}
.stop-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.main-flex {
  display: flex;
  align-items: flex-start;
  gap: 2rem;
}
.log-box.left {
  min-width: 300px;
  max-width: 350px;
  flex: 0 0 320px;
}
.log-box textarea {
  width: 100%;
  font-family: monospace;
  background: #222;
  color: #b6fcd5;
  border: 1px solid #444;
  border-radius: 0.3em;
  padding: 0.5em;
  resize: vertical;
}
.table-box {
  flex: 1 1 0%;
}
.error {
  color: red;
  margin: 1rem 0;
}
.info {
  color: #0074d9;
  margin: 1rem 0;
}
.device-table {
  border-collapse: collapse;
  margin: 1rem 0;
  width: 100%;
  max-width: 700px;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.5rem 1rem;
  text-align: left;
}
.device-id {
  font-family: monospace;
  font-size: 1.1em;
}
.status {
  padding: 0.2em 0.7em;
  border-radius: 0.5em;
  font-weight: bold;
  text-transform: capitalize;
}
.status.device {
  background: #e0ffe0;
  color: #1a7f1a;
}
.status.unauthorized {
  background: #ffe0e0;
  color: #a11a1a;
}
.assign-btn {
  margin-top: 1rem;
  font-size: 1.1em;
  padding: 0.5em 1.5em;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 0.3em;
  cursor: pointer;
  transition: background 0.2s;
}
.assign-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
button.on {
  background-color: #42b983;
  color: white;
}
button.off {
  background-color: #ccc;
  color: #333;
}
</style>
