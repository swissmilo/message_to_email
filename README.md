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
git clone https://github.com/swissmilo/message_to_email.git
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

#### For Interactive Use (Terminal)
1. Open **System Settings**
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click the **+** button
4. Add your terminal application (Terminal.app, iTerm2, etc.)
5. **Restart your terminal**

#### For Background Service (Required for Auto-Startup)
When using the system service (`npm run cli -- install`), Node.js itself needs Full Disk Access:

1. Open **System Settings**
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click the **+** button
4. Navigate to and add your Node.js executable:
   - **Homebrew Node.js**: `/opt/homebrew/bin/node`
   - **System Node.js**: `/usr/local/bin/node`
   - **Find your path**: Run `which node` in terminal to locate

> **Note**: You need BOTH terminal and Node.js permissions for full functionality. Without Node.js permission, the background service will fail with "Full Disk Access required" errors.

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
```

#### Test Email Setup
```bash
npm run cli -- email --config
npm run cli email --test
```

### 3: macOS Contacts Setup (Optional but Recommended)
```bash
# Download all contacts for name resolution (Apple Script takes ~5 minutes per 1,000 contacts, one-time setup)
npm run cli -- contacts --sync

# Check contact cache status
npm run cli -- contacts --cache-info
```

> **Note**: Contact sync is optional but highly recommended. Without it, you'll see phone numbers like "+14155551234" instead of names like "Sarah Johnson" in your emails.

### 4: Add Conversations to Track
```bash
# Interactive menu to add conversations
npm run cli -- sync

# Add yourself for testing (replace with your iPhone number)
npm run cli -- sync --add "+14155555555"  # Your iPhone number
```

**Contact Name Lookup**: When adding numbers, the system automatically looks up contact names from your macOS Contacts app and suggests them.

### 5: Install & Start Background Service
```bash
# Install as system service (auto-starts on boot)
npm run cli -- install

# Check service status
npm run cli -- install --status

# View live logs
npm run cli -- install --logs
```

### 6: Test It! 
1. **Send yourself an iMessage** from your own phone to your iPhone number
2. **Wait ~1 minute** (service checks every minute)
3. **Check your Gmail inbox** for the forwarded message

**Example Email Subject**: `iMessage: You (+14155555555)` or `iMessage: John Smith (+14155555555)`

## Usage Reference

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
# Run sync service manually (checks every minute)
npm run cli -- service

# Run with verbose logging
npm run cli -- service --verbose

# Run once for testing
npm run cli -- service --once
```

### System Service Installation

Install as a macOS Launch Agent for automatic startup:

```bash
# Interactive installation menu
npm run cli -- install

# Quick commands
npm run cli -- install --status     # Check service status
npm run cli -- install --start      # Start the service
npm run cli -- install --stop       # Stop the service
npm run cli -- install --restart    # Restart the service
npm run cli -- install --logs       # View service logs
npm run cli -- install --uninstall  # Remove the service
```

**🚀 Auto-Startup Features:**
- **Automatic startup** on system boot
- **Auto-restart** on crashes
- **Background logging** to `~/Library/Logs/imessage-sync.log`
- **System integration** via macOS Launch Agent
- **Easy management** with CLI commands

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

### Development

```bash
# Run in development mode
npm run dev -- list

# Build the project
npm run build
```

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
│   │   ├── contacts.ts    # Contact management command
│   │   ├── messages.ts    # Message debugging command
│   │   └── install.ts     # Service installation command
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
├── scripts/
│   └── com.imessage-sync.plist  # macOS Launch Agent template
├── imessage-sync-config.json    # Configuration file (auto-generated)
├── contacts-config.json         # Manual contact mappings (auto-generated)
├── contacts-cache.json          # Cached contacts from macOS Contacts (auto-generated)
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

## Email Subject Format

The app creates smart email subjects that always include phone numbers for easy filtering:

**When contact name is available:**
- `iMessage: Sarah (+14156300622)`
- `Re: iMessage: John Smith (+14155551234)`

**When no contact name found:**
- `iMessage: +1 (415) 555-1234`
- `Re: iMessage: +1 (415) 555-1234`

**Benefits for Gmail filtering:**
- Set up filters based on phone numbers: `(+14156305555)`
- Easily identify conversation participants
- Professional appearance with contact names

## Troubleshooting

### "Permission Denied" Error

If you see a permission error:
1. Grant Full Disk Access to your terminal application and restart it
2. For background service: Grant Full Disk Access to Node.js executable (see setup instructions above)

### "Full Disk Access required" in Service Logs

If the background service fails with Full Disk Access errors:
1. Find your Node.js path: `which node`
2. Add that path to **Privacy & Security** → **Full Disk Access**
3. Restart the service: `npm run cli -- install --restart`

### "imessage-exporter not found" Error

Make sure imessage-exporter is installed and available in your PATH:

```bash
# Verify installation
imessage-exporter --version

# Install if missing
brew install imessage-exporter
```

### Service Not Starting

If `npm run cli -- install --status` shows the service isn't running:
1. Check that auto-sync is enabled: `npm run cli -- sync --status`
2. Ensure you have tracked conversations: `npm run cli -- sync --status`
3. Check logs for errors: `npm run cli -- install --logs`

### Contact Names Not Showing

If you see phone numbers instead of names in emails:
1. Run contact sync: `npm run cli -- contacts --sync`
2. Check cache status: `npm run cli -- contacts --cache-info`
3. Test lookup: `npm run cli -- contacts --test "+14155551234"`

## License

MIT
