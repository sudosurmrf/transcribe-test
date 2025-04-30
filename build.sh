#a flag that will terminal the build if any non-zero exit codes are seen. 
set -e

#install system deps here
apt-get update
apt-get install -y \
  curl \
  gnupg2 \
  python3 \
  python3-pip \
  ffmpeg

# installs whisper from python3
pip3 install openai-whisper

npm install
