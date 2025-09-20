# iMessage to Email Sync CLI

A TypeScript CLI tool that extracts iMessage conversations and prepares them for email delivery using the ReagentX/imessage-exporter library.

## Prerequisites

1. **macOS** - This tool only works on macOS as it needs access to the Messages database
2. **Node.js 18+** - Install from [nodejs.org](https://nodejs.org/)
3. **imessage-exporter** - Install using one of these methods:

```bash
# Using Homebrew
brew install imessage-exporter

# Using Cargo (requires Rust)
cargo install imessage-exporter
```

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd text_to_email
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Permissions Setup

### Full Disk Access Required

This tool requires Full Disk Access to read your Messages database. To grant permission:

1. Open **System Settings**
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click the **+** button
4. Add your terminal application (Terminal.app, iTerm2, etc.)
5. **Restart your terminal**

## Usage

### List Recent Conversations

```bash
# List recent conversations
npm run cli list

# Show more conversations
npm run cli list --limit 50

# Include group chats
npm run cli list --groups
```

### Sync Management

```bash
# Interactive sync setup
npm run cli sync

# View sync status
npm run cli sync --status

# Add conversation to tracking
npm run cli sync --add "+15551234567"

# Remove conversation from tracking
npm run cli sync --remove "+15551234567"
```

### Background Service

```bash
# Run sync service (checks every minute)
npm run cli service

# Run with verbose logging
npm run cli service --verbose
```

### Development

```bash
# Run in development mode
npm run dev list

# Build the project
npm run build
```

## Features Implemented

- ✅ TypeScript CLI with Commander.js
- ✅ Integration with imessage-exporter Rust binary
- ✅ Permission checking for Full Disk Access
- ✅ Installation verification for dependencies
- ✅ **Real conversation parsing from Messages database**
- ✅ List recent message threads with formatting
- ✅ Filter individual vs group conversations
- ✅ Human-readable date formatting
- ✅ Phone number formatting for display
- ✅ Conversation sorting by last message date
- ✅ Message count and participant detection
- ✅ **Interactive sync command for conversation tracking**
- ✅ **Configuration management with JSON persistence**
- ✅ **Automatic background service with cron scheduling**
- ✅ **Command-line options for quick operations**
- ✅ **Incremental sync simulation (ready for email integration)**

## Project Structure

```
text_to_email/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   ├── list.ts        # List command implementation
│   │   ├── sync.ts        # Interactive sync command
│   │   └── service.ts     # Background service command
│   ├── services/
│   │   ├── MessageExporter.ts  # Wrapper for imessage-exporter
│   │   └── ConfigManager.ts    # Configuration management
│   ├── types/
│   │   ├── index.ts       # Core TypeScript interfaces
│   │   └── config.ts      # Configuration type definitions
│   └── utils/
│       └── permissions.ts  # Permission checking utilities
├── package.json
├── tsconfig.json
└── README.md
```

## Next Steps

The following features are planned for future development:

1. **Gmail Integration** - OAuth2 authentication and email sending
2. **Sync Command** - Interactive conversation selection and syncing
3. **Configuration Management** - Store preferences and sync history
4. **Incremental Sync** - Only sync new messages since last run
5. **Email Threading** - Proper email headers for conversation threading

## Current Status

### ✅ Real Data Parsing Implemented!

The CLI now successfully parses **real conversations** from your Messages database by:

1. **Exporting recent messages** (last 30 days) using imessage-exporter
2. **Parsing HTML output** to extract conversation metadata
3. **Displaying actual contacts** with proper formatting
4. **Showing real message counts** and timestamps

### Performance Note

The first run may take a few seconds as it exports and parses your recent messages. Subsequent optimizations could include caching or incremental updates.

## Troubleshooting

### "Permission Denied" Error

If you see a permission error, make sure you've granted Full Disk Access to your terminal application and restarted it.

### "imessage-exporter not found" Error

Make sure imessage-exporter is installed and available in your PATH. You can verify installation with:

```bash
imessage-exporter --version
```

## License

MIT
