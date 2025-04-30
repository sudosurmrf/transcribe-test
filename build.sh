#!/bin/bash

# Install Python
apt-get update
apt-get install -y python3 python3-pip ffmpeg

# Install Whisper
pip3 install openai-whisper

# Continue with Node.js install
npm install
