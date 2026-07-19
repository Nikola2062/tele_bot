# 🤖 NewsNow Telegram Bot Setup Guide

This guide will help you set up and run the NewsNow Telegram Bot that provides real-time news aggregation with the same core functionality as the main newsnow project.

## Prerequisites

- Node.js 20 or higher
- npm or yarn package manager
- A Telegram account
- Basic command line knowledge

## Step 1: Create Your Telegram Bot

1. **Message @BotFather** on Telegram
2. **Create a new bot**:
   ```
   /newbot
   ```
3. **Choose a name** for your bot (e.g., "My News Bot")
4. **Choose a username** (must end with 'bot', e.g., "mynews_bot")
5. **Save the bot token** - you'll need this later
6. **Optional**: Set a description and profile picture using BotFather commands

## Step 2: Install Dependencies

```bash
cd telegram-bot
npm install
```

## Step 3: Configure Environment

1. **Copy the example environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file** with your bot details:
   ```env
   BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   BOT_USERNAME=mynews_bot
   DATABASE_PATH=./data/cache.db
   ENABLE_CACHE=true
   INIT_TABLE=true
   LOG_LEVEL=info
   DEFAULT_CACHE_TTL=1800000
   MIN_REFRESH_INTERVAL=120000
   ```

## Step 4: Test the Setup

**Run the test script** to verify sources are working:
```bash
npm run test:sources
```

This will test all implemented news sources and show you which ones are working.

## Step 5: Start the Bot

### Option A: Development Mode
```bash
npm run dev
```

### Option B: Production Mode
```bash
npm run build
npm start
```

### Option C: Using Docker
```bash
# Make sure your .env file is configured first
docker-compose up -d
```

## Step 6: Test Your Bot

1. **Find your bot** on Telegram by searching for its username
2. **Start a conversation** with `/start`
3. **Try some commands**:
   - `/help` - Show available commands
   - `/sources` - List all news sources
   - `douyin` - Get Douyin trending topics
   - `weibo` - Get Weibo hot searches
   - `github` - Get GitHub trending repositories

## Available Sources

The bot currently supports these news sources:

- **Chinese Social Media**: douyin, weibo, zhihu
- **Tech Platforms**: github, hackernews, v2ex
- **News Sites**: Various Chinese and international sources

Type `/sources` in your bot to see the complete list.

## Troubleshooting

### Bot doesn't respond
- Check that `BOT_TOKEN` is correct
- Verify the bot is running without errors
- Make sure you've started a conversation with the bot first

### Sources return errors
- Some sources may be blocked or rate-limited
- Check the console logs for specific error messages
- Try different sources to see which ones work

### Cache issues
- Delete the cache file: `rm data/cache.db`
- Restart the bot
- Set `INIT_TABLE=true` in `.env`

### Permission errors
- Make sure the `data/` directory is writable
- Check file permissions: `chmod 755 data/`

## Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Show welcome message | `/start` |
| `/help` | Show help information | `/help` |
| `/sources` | List available sources | `/sources` |
| `/latest <source>` | Force refresh from source | `/latest douyin` |
| `/stats` | Show cache statistics | `/stats` |
| `<source>` | Get news from source | `weibo` |

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | **Required** |
| `BOT_USERNAME` | Bot username | **Required** |
| `DATABASE_PATH` | SQLite database path | `./data/cache.db` |
| `ENABLE_CACHE` | Enable caching | `true` |
| `LOG_LEVEL` | Logging level | `info` |
| `DEFAULT_CACHE_TTL` | Cache TTL in ms | `1800000` (30 min) |

### Cache Settings

The bot uses intelligent caching to avoid rate limiting:
- **Default TTL**: 30 minutes
- **Source-specific intervals**: Each source has its own refresh interval
- **Fallback**: If fresh data fails, cached data is used

## Deployment Options

### Local Development
Best for testing and development.

### Docker
Recommended for production deployment:
```bash
docker-compose up -d
```

### Cloud Platforms
You can deploy to:
- **Heroku**: Use the included `Dockerfile`
- **DigitalOcean**: Docker droplet
- **AWS/GCP**: Container services
- **VPS**: Any Linux server with Docker

## Performance Tips

1. **Monitor cache hit rates** using `/stats`
2. **Adjust refresh intervals** for high-traffic sources
3. **Use Docker** for better resource management
4. **Monitor logs** to identify problematic sources
5. **Set up alerts** for bot downtime

## Adding New Sources

To add new news sources:

1. **Create a new source file** in `src/sources/`
2. **Implement the source fetcher** following existing patterns
3. **Add the source** to `src/sources/index.ts`
4. **Update source definitions** in `src/shared/sources.ts`
5. **Test the new source** with the test script

See existing source files like `douyin.ts` or `weibo.ts` for examples.

## Support

If you encounter issues:

1. **Check the logs** for error messages
2. **Run the test script** to identify problematic sources
3. **Check GitHub issues** in the main newsnow repository
4. **Review the troubleshooting section** above

## Security Notes

- Keep your `BOT_TOKEN` secret
- Don't commit `.env` files to version control
- Use Docker for isolation in production
- Monitor bot usage for abuse
- Consider rate limiting for high-traffic deployments

Happy news aggregating! 🗞️🤖