#!/bin/bash

# NewsNow Telegram Bot Startup Script

set -e

echo "🤖 Starting NewsNow Telegram Bot..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "📋 Please copy .env.example to .env and configure your bot token:"
    echo "   cp .env.example .env"
    echo "   # Edit .env with your TELEGRAM_BOT_TOKEN"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create data directory if it doesn't exist
mkdir -p data

# Check TypeScript compilation
echo "🔨 Building TypeScript..."
npm run build

# Start the bot
echo "🚀 Starting bot..."
npm start