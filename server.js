import express from 'express';
import fs from 'fs/promises';
import {createWriteStream} from 'fs';
import { exec } from 'child_process';
import {v4 as uuid} from 'uuid';
import path from 'path';
import {pipeline} from 'stream/promises';
import http from 'http';
import https from 'https';
import urlModule from 'url';

const app = express();
app.use(express.json());

const TEMP_DIR = './tmp';
await fs.mkdir(TEMP_DIR, { recursive: true});

const downloadFile = async (fileUrl, outputPath) => {
  const url = new URL(fileUrl);
  const client = url.protocol === 'https:' ? https : http;

  const response = await new Promise((resolve, reject) => {
    client.get(fileUrl, (res) => {
      if(res.statusCode !== 200){
        reject(new Error(`failed to get ${fileUrl} (${res.statusCode})`));
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
  await pipeline(response, createWriteStream(outputPath));
}


app.post('/api/transcribe', async (req, res, next) => {
  const {url} = req.body;
  if(!url) return res.status(404).json('vid required.')
  
  const id = uuid();
  const videoPath = path.join(TEMP_DIR, `${id}.mp4`);
  const outputDir = path.join(TEMP_DIR, `output-${id}`);
  const transcriptPath = path.join(outputDir, `${id}.txt`);

  try{
    await downloadFile(url, videoPath);

    await new Promise((resolve, reject) => {
      exec(`whisper "${videoPath}" --model base --output_dir ${outputDir} --output_format txt`,
        (err, stdout, stderr) => {
          if(err) reject(err);
          else resolve();
        }
      )
    });
    const transcript = await fs.readFile(transcriptPath, 'utf-8');
    res.status(201).json(transcript);

    await fs.rm(videoPath, { force: true});
    await fs.rm(outputDir, { recursive: true, force: true});

  }catch(err){
    console.log(err);
    res.status(500).json('error transcribing', err);
  }
});

app.listen(process.env.PORT, ()=> {
  console.log(`listening on ${process.env.PORT}`)
});