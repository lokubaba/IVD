#!/bin/bash
cd "$(dirname "$0")"

echo "========================================="
echo " Starting YTV_Downloader Server"
echo "========================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js (brew install node or from https://nodejs.org/)"
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

# Check node_modules
if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
fi

echo "Launching server..."
npm start
