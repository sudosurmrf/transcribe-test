import express from 'express';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { exec } from 'child_process';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { pipeline } from 'stream/promises';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';


const app = express();
app.use(express.json());


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const TEMP_DIR   = path.join(__dirname, 'tmp');
await fs.mkdir(TEMP_DIR, { recursive: true });

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
  const { pathname } = new URL(url);         
  const id = uuid();
  const ext= path.extname(pathname) || '.mp4';
  const videoPath  = path.join(TEMP_DIR, `${id}${ext}`);  
  console.log('about to download into:', videoPath);

  const outputDir = path.join(TEMP_DIR, `output-${id}`);
  const transcriptPath = path.join(outputDir, `${id}.txt`);

  try {
    await downloadFile(url, videoPath);

    await fs.mkdir(outputDir, { recursive: true });

    // run whisper
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

    // attempt to access the transcript txt file
    await fs.access(transcriptPath); 

    // read file and return in json.
    const transcript = await fs.readFile(transcriptPath, 'utf-8');
    res.status(201).json({ transcript });

  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });

  } finally {
    //file cleanup for later
    await fs.rm(videoPath, { force: true }).catch(() => {});
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
});


app.listen(process.env.PORT, ()=> {
  console.log(`listening on ${process.env.PORT}`)
});