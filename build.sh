#!/usr/bin/env bash
set -e

# 1) Update and install system deps
apt-get update
apt-get install -y \
  curl \
  gnupg2 \
  python3 \
  python3-pip \
  ffmpeg

# 2) Install Whisper
pip3 install openai-whisper

# 3) Install Node.js 20.x from NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 4) Verify versions (optional, for debug)
echo "python:" $(python3 --version)
echo "ffmpeg:" $(ffmpeg -version | head -n1)
echo "node:" $(node --version)
echo "npm:"  $(npm --version)

# 5) Install your Node dependencies
npm install
