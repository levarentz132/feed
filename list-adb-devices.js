// Node.js script to list connected ADB devices and store them in a JSON file
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function listAdbDevices() {
  exec('adb devices', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing adb: ${error}`);
      return;
    }
    const lines = stdout.split('\n').slice(1); // skip the first line
    const devices = lines
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('*'))
      .map(line => {
        const [id, status] = line.split(/\s+/);
        return { id, status };
      });
    const outputPath = path.join(__dirname, 'adb_devices.json');
    fs.writeFileSync(outputPath, JSON.stringify(devices, null, 2));
    console.log(`Found ${devices.length} device(s). Saved to adb_devices.json.`);
  });
}

listAdbDevices();
