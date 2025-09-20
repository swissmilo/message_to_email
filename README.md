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

## Setup Instructions

### 1. Full Disk Access (Required)

This tool requires Full Disk Access to read your Messages database:

1. Open **System Settings**
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click the **+** button
4. Add your terminal application (Terminal.app, iTerm2, etc.)
5. **Restart your terminal**

### 2. Gmail Configuration (For Email Sync)

#### Enable 2-Factor Authentication
- Go to: https://myaccount.google.com/security
- Enable 2-Step Verification if not already enabled

#### Generate App Password
- Go to: https://myaccount.google.com/apppasswords
- Generate a new app password for "Mail"
- Copy the 16-character password (format: abcd efgh ijkl mnop)

#### Set Environment Variables
```bash
# Copy example file
cp env.example .env

# Edit .env file with your details:
GMAIL_USER=youremail@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
EMAIL_TO=recipient@gmail.com
EMAIL_FROM_NAME=iMessage Sync
```

#### Test Setup
```bash
npm run cli email --test
```

## Usage

### List Recent Conversations

```bash
# List recent conversations
npm run cli -- list

# Show more conversations
npm run cli -- list --limit 50

# Include group chats
npm run cli -- list --groups
```

### Sync Management

```bash
# Interactive sync setup
npm run cli -- sync

# View sync status
npm run cli -- sync --status

# Add conversation to tracking
npm run cli -- sync --add "+15551234567"

# Remove conversation from tracking
npm run cli -- sync --remove "+15551234567"
```

### Email Configuration

```bash
# Configure Gmail settings (interactive)
npm run cli -- email

# Configure email settings
npm run cli -- email --config

# Send test email
npm run cli -- email --test
```

### Background Service

```bash
# Run sync service (checks every minute)
npm run cli -- service

# Run with verbose logging
npm run cli -- service --verbose
```

### Contact Management

```bash
# Download all contacts for fast lookups (one-time setup)
npm run cli -- contacts --sync

# Check contact cache status
npm run cli -- contacts --cache-info

# Test contact resolution
npm run cli -- contacts --test "+14155551234"

# View all manual contact mappings
npm run cli -- contacts --list

# Add manual contact mapping (will prompt for name)
npm run cli -- contacts --add "+14155551234"

# Remove contact mapping
npm run cli -- contacts --remove "+14155551234"

# Interactive contact menu
npm run cli -- contacts
```

**🚀 Fast Contact Caching System:**
- **One-Time Sync**: Run `--sync` to download all ~800 contacts in ~5 minutes
- **Lightning-Fast Lookups**: Contact resolution takes 0ms after caching
- **30-Day Cache**: Cache stays fresh for 30 days, no daily re-downloading
- **Graceful Fallbacks**: Works without cache using formatted phone numbers
- **Real Names**: "Lydia Yale" instead of "+1 (917) 697-2702"

**Contact Resolution Features:**
- **macOS Contacts Integration**: Automatically lookup names from your Contacts app  
- **Manual Mappings**: Map phone numbers/emails to display names (as backup)
- **Auto +1 Country Code**: Automatically adds +1 to 10-digit US/Canada numbers
- **Smart Phone Formatting**: Pretty formatting like "+1 (415) 555-1234"
- **Input Normalization**: CLI auto-formats phone input (e.g., "4155551234" → "+14155551234")
- **Batch Processing**: Downloads contacts in batches of 10 for reliability

### Development

```bash
# Run in development mode
npm run dev -- list

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
- ✅ **Gmail integration with Nodemailer**
- ✅ **Email formatting with proper threading headers**
- ✅ **Environment variable configuration**
- ✅ **Email testing and validation**
- ✅ **Real message-to-email conversion**
- ✅ **Contact name resolution with manual mappings**
- ✅ **macOS Contacts app integration with fast caching**
- ✅ **Lightning-fast contact lookups (0ms after cache)**
- ✅ **Smart email subjects with phone numbers for filtering**
- ✅ **Auto +1 country code addition for US/Canada numbers**
- ✅ **Batch contact downloading for reliability**
- ✅ **Historical message filtering for new contacts**

## Project Structure

```
text_to_email/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   ├── list.ts        # List command implementation
│   │   ├── sync.ts        # Interactive sync command
│   │   ├── service.ts     # Background service command
│   │   ├── email.ts       # Email configuration command
│   │   └── contacts.ts    # Contact management command
│   ├── services/
│   │   ├── MessageExporter.ts  # Wrapper for imessage-exporter
│   │   ├── ConfigManager.ts    # Configuration management
│   │   ├── GmailService.ts     # Gmail/email integration
│   │   ├── ContactResolver.ts  # Contact name resolution
│   │   └── ContactCache.ts     # Fast contact caching system
│   ├── types/
│   │   ├── index.ts       # Core TypeScript interfaces
│   │   └── config.ts      # Configuration type definitions
│   └── utils/
│       └── permissions.ts  # Permission checking utilities
├── imessage-sync-config.json  # Configuration file (auto-generated)
├── contacts-config.json   # Manual contact mappings (auto-generated)
├── contacts-cache.json    # Cached contacts from macOS Contacts (auto-generated)
├── .env                   # Environment variables (create from env.example)
├── env.example           # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration Files

### `imessage-sync-config.json`
This file is automatically created in the app directory and contains:
- **Tracked conversations**: Phone numbers/emails you want to sync
- **Sync settings**: Interval, auto-sync enabled/disabled
- **Email configuration**: Sender name, recipient overrides
- **Export settings**: Format, attachments, message limits

### `contacts-config.json`
This file is automatically created when you add manual contact mappings:
- **Manual Mappings**: Phone numbers/emails mapped to display names
- **Automatic Creation**: Created when you use `contacts --add` command
- **JSON Format**: Simple key-value pairs for easy editing

Example:
```json
{
  "+14155551234": "John Smith",
  "jane@example.com": "Jane Doe"
}
```

### `contacts-cache.json`
This file is automatically created when you run `contacts --sync`:
- **Cached Contacts**: All contacts from your macOS Contacts app (~800 contacts)
- **Indexed Lookups**: Pre-indexed phone numbers and emails for 0ms lookups
- **30-Day Validity**: Automatically considered stale after 30 days
- **Large File**: Contains all contact data, indexed for fast searching

### `.env`
Environment variables for Gmail authentication (create from `env.example`):
- `GMAIL_USER`: Your Gmail email address
- `GMAIL_APP_PASSWORD`: 16-character app password from Google
- `EMAIL_TO`: Recipient email address
- `EMAIL_FROM_NAME`: Display name for sent emails

## Email Subject Format

The app creates smart email subjects that always include phone numbers for easy filtering:

**When contact name is available:**
- `iMessage: Sarah (+14156300688)`
- `Re: iMessage: John Smith (+14155551234)`

**When no contact name found:**
- `iMessage: +1 (415) 555-1234`
- `Re: iMessage: +1 (415) 555-1234`

**Benefits for Gmail filtering:**
- Set up filters based on phone numbers: `(+14156300688)`
- Easily identify conversation participants
- Professional appearance with contact names

## Current Status

### 🎉 Fully Functional iMessage to Email Sync!

The system is now production-ready with:

1. **Real-Time Message Sync** - Background service monitors and forwards new messages
2. **Lightning-Fast Contact Resolution** - 0ms lookups after initial 5-minute setup
3. **Smart Historical Filtering** - Only emails new messages when contacts are added
4. **Professional Email Threading** - Proper Gmail conversation threading
5. **Robust Permission Handling** - Clear setup instructions and error messages

### Quick Start Guide

1. **Setup**: Grant Full Disk Access, install dependencies, configure Gmail
2. **Sync Contacts**: `npm run cli -- contacts --sync` (one-time, ~5 minutes)
3. **Add Conversations**: `npm run cli -- sync --add "+15551234567"`
4. **Start Service**: `npm run cli -- service` (runs continuously)

🎯 **Result**: New iMessages automatically appear in your Gmail inbox with proper contact names!

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
