const express               = require('express');
const fs                    = require('fs/promises');
const { createWriteStream } = require('fs');
const { exec }              = require('child_process');
const { v4: uuid }          = require('uuid');
const path                  = require('path');
const { pipeline }          = require('stream/promises');
const http                  = require('http');
const https                 = require('https');
const { URL }               = require('url');

const app = express();
app.use(express.json());

const TEMP_DIR = path.join(__dirname, 'tmp');
const PORT     = process.env.PORT || 3000;

// choose the python command:
// it will be different on linux vs when I was doing it on windows so we had to adapt this
//this what was causing it to fail on railway, but not on render or my computer. 

const pythonBin = process.env.WHISPER_PYTHON 
  || (process.platform === 'win32' ? 'py -3' : 'python3');

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
  const id = uuid();
  const ext = path.extname(pathname) || '.mp4';
  const videoPath = path.join(TEMP_DIR, `${id}${ext}`);
  const outputDir = path.join(TEMP_DIR, `output-${id}`);
  const transcriptPath= path.join(outputDir, `${id}.txt`);

  console.log('about to download into:', videoPath);

  try {
    // download starts here
    await downloadFile(url, videoPath);

    // create the outputdir early since I had an issue with this in the beginning. 
    await fs.mkdir(outputDir, { recursive: true });

    // run whisper via the python launcher instead of globally since railway cant add it to path without extra steps.
    await new Promise((resolve, reject) => {
      const cmd = [
        pythonBin,
        '-m whisper',
        `"${videoPath}"`,
        '--model tiny',
        `--output_dir "${outputDir}"`,
        '--output_format txt'
      ].join(' ');
      console.log('Running:', cmd);
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          console.error('Whisper failed:', stderr);
          return reject(err);
        }
        console.log('Whisper succeeded:', stdout);
        resolve();
      });
    });

    // verify output - still no clue what this is for lol. 
    await fs.access(transcriptPath);

    // read & respond
    const transcript = await fs.readFile(transcriptPath, 'utf-8');
    res.status(201).json({ transcript });

  } catch (err) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });

  } finally {
    // cleanup the tmp folder so it doesn't take up a ton of space. 
    await fs.rm(videoPath, { force: true }).catch(() => {});
    await fs.rm(outputDir,   { recursive: true, force: true }).catch(() => {});
  }
});


(async () => {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    app.listen(PORT, () => console.log(`Listening on ${PORT}`));
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();
