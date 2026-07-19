# NewsNow Telegram Bot

A Telegram bot that provides real-time news aggregation using the same core functionality as the newsnow project. Users can request news from specific sources like Douyin, Weibo, Zhihu, and many others.

## Features

- 🔄 **Real-time News**: Get the latest trending news from multiple sources
- 🎯 **Source-specific Requests**: Request news from specific sources (e.g., "douyin", "weibo")
- 💾 **Smart Caching**: Efficient caching system to avoid rate limiting
- 📱 **Mobile-friendly**: Optimized for mobile viewing with proper URL handling
- 🌐 **Multi-source Support**: Support for 40+ news sources

## Supported Sources

- **Chinese Social**: Weibo, Douyin, Zhihu, Hupu, Tieba
- **Tech News**: IT之家, V2EX, GitHub Trending, Hacker News
- **Finance**: 华尔街见闻, 财联社, 36氪, 雪球
- **General News**: 澎湃新闻, 参考消息, 联合早报
- And many more...

## Quick Start

1. **Clone and Setup**:
   ```bash
   cd telegram-bot
   npm install
   cp .env.example .env
   ```

2. **Configure Bot**:
   - Create a new bot with [@BotFather](https://t.me/botfather)
   - Copy the bot token to your `.env` file
   - Update `BOT_TOKEN` and `BOT_USERNAME` in `.env`

3. **Run the Bot**:
   ```bash
   # Development
   npm run dev
   
   # Production
   npm run build
   npm start
   ```

## Usage

Once the bot is running, users can interact with it:

- `/start` - Get welcome message and available commands
- `/help` - Show help information
- `/sources` - List all available news sources
- `/latest <source>` - Get latest news from a specific source

**Examples**:
- `douyin` - Get Douyin trending topics
- `weibo` - Get Weibo hot searches
- `zhihu` - Get Zhihu trending questions
- `github` - Get GitHub trending repositories

## Architecture

The bot reuses core components from the newsnow project:

- **Source System**: Individual source scrapers for each news platform
- **Caching Layer**: SQLite-based caching with configurable TTL
- **Type Safety**: Full TypeScript support with shared type definitions
- **Error Handling**: Graceful fallback to cached data when sources fail

## Configuration

Edit `.env` file:

```env
BOT_TOKEN=your_telegram_bot_token
BOT_USERNAME=your_bot_username
DATABASE_PATH=./data/cache.db
ENABLE_CACHE=true
DEFAULT_CACHE_TTL=1800000  # 30 minutes
MIN_REFRESH_INTERVAL=120000  # 2 minutes
```

## Development

The project structure mirrors the newsnow architecture:

```
src/
├── shared/          # Shared types and utilities
├── sources/         # News source scrapers
├── database/        # SQLite caching system
├── utils/           # Helper functions
├── handlers/        # Telegram bot message handlers
└── index.ts         # Main bot entry point
```

## License

MIT License - see the main newsnow project for details.