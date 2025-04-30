// server.cjs

const express           = require('express');
const fs                = require('fs/promises');
const { createWriteStream } = require('fs');
const { exec }          = require('child_process');
const { v4: uuid }      = require('uuid');
const path              = require('path');
const { pipeline }      = require('stream/promises');
const http              = require('http');
const https             = require('https');
const { URL }           = require('url');

const app = express();
app.use(express.json());

// Use Node's built-in __dirname
const TEMP_DIR = path.join(__dirname, 'tmp');

async function downloadFile(fileUrl, outputPath) {
  const { protocol } = new URL(fileUrl);
  const client = protocol === 'https:' ? https : http;

  const res = await new Promise((resolve, reject) => {
    client.get(fileUrl, (r) => {
      if (r.statusCode !== 200) {
        return reject(new Error(`Download failed: ${r.statusCode}`));
      }
      resolve(r);
    }).on('error', reject);
  });

  await pipeline(res, createWriteStream(outputPath));
}

app.post('/api/transcribe', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing "url" in body' });

  const { pathname } = new URL(url);
  const id   = uuid();
  const ext  = path.extname(pathname) || '.mp4';
  const videoPath    = path.join(TEMP_DIR, `${id}${ext}`);
  const outputDir    = path.join(TEMP_DIR, `output-${id}`);
  const transcriptPath = path.join(outputDir, `${id}.txt`);

  console.log('about to download into:', videoPath);

  try {
    await downloadFile(url, videoPath);
    await fs.mkdir(outputDir, { recursive: true });

    await new Promise((resolve, reject) => {
      const cmd = `whisper "${videoPath}" --model tiny --output_dir "${outputDir}" --output_format txt`;
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error('Whisper failed:', stderr);
          return reject(err);
        }
        console.log('Whisper succeeded:', stdout);
        resolve();
      });
    });

    // ensure transcript exists
    await fs.access(transcriptPath);

    const transcript = await fs.readFile(transcriptPath, 'utf-8');
    res.status(201).json({ transcript });

  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });

  } finally {
    // cleanup
    await fs.rm(videoPath, { force: true }).catch(() => {});
    await fs.rm(outputDir,   { recursive: true, force: true }).catch(() => {});
  }
});

const PORT = process.env.PORT || 3000;

// wrap mkdir + listen in async IIFE
(async () => {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    app.listen(PORT, () => console.log(`listening on ${PORT}`));
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();
