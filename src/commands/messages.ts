import { Command } from 'commander';
import chalk from 'chalk';
import { MessageExporter } from '../services/MessageExporter';
import { ContactResolver } from '../services/ContactResolver';

export const messagesCommand = new Command('messages')
  .description('List messages for a specific contact or phone number')
  .argument('<identifier>', 'Phone number or contact identifier to show messages for')
  .option('-l, --limit <number>', 'Number of recent messages to show (default: 20)', '20')
  .option('-d, --days <number>', 'Number of days back to search (default: 7)', '7')
  .option('--sent', 'Show only messages you sent')
  .option('--received', 'Show only messages you received')
  .option('--raw', 'Show raw message data including timestamps')
  .action(async (identifier, options) => {
    try {
      console.log(chalk.cyan(`📱 Messages for: ${identifier}`));
      console.log(chalk.gray(`   Limit: ${options.limit} messages`));
      console.log(chalk.gray(`   Days back: ${options.days} days`));
      console.log();

      // Normalize the phone number input
      const normalizedIdentifier = normalizePhoneInput(identifier);
      console.log(chalk.gray(`   Normalized ID: ${normalizedIdentifier}`));
      console.log();

      const exporter = new MessageExporter();
      const contactResolver = new ContactResolver();

      // Calculate date range - add some buffer to catch very recent messages
      const endDate = new Date(Date.now() + 60000); // 1 minute in the future
      const startDate = new Date(Date.now() - parseInt(options.days) * 24 * 60 * 60 * 1000);

      console.log(chalk.gray(`   Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`));
      console.log();

      // Export messages for this contact
      const tempDir = `temp_messages_${Date.now()}`;
      const exportOptions = {
        format: 'html' as const,
        outputDir: tempDir,
        // Remove date filters to get ALL messages
        // startDate,
        // endDate,
        noAttachments: true,
        contacts: [normalizedIdentifier], // Filter to this contact only
      };

      console.log(chalk.yellow('🔄 Exporting messages...'));
      const exportResult = await exporter.exportMessages(exportOptions);
      
      if (!exportResult.success) {
        console.error(chalk.red(`❌ Export failed: ${exportResult.error}`));
        process.exit(1);
      }

      // Parse the exported messages
      const fs = await import('fs/promises');
      const path = await import('path');
      
      try {
        const files = await fs.readdir(tempDir);
        const htmlFiles = files.filter(file => file.endsWith('.html'));
        
        if (htmlFiles.length === 0) {
          console.log(chalk.yellow('📭 No messages found for this contact in the specified time range.'));
          return;
        }

        let allMessages: any[] = [];
        
        for (const htmlFile of htmlFiles) {
          const filePath = path.join(tempDir, htmlFile);
          const parsedData = await exporter.parseExportedData(filePath);
          
          for (const [chatId, messages] of parsedData.conversations) {
            allMessages = allMessages.concat(messages);
          }
        }

        // Sort messages by date (newest first)
        allMessages.sort((a, b) => b.date.getTime() - a.date.getTime());

        // Apply filters
        if (options.sent) {
          allMessages = allMessages.filter(msg => msg.isFromMe);
        } else if (options.received) {
          allMessages = allMessages.filter(msg => !msg.isFromMe);
        }

        // Limit results
        const limitedMessages = allMessages.slice(0, parseInt(options.limit));

        if (limitedMessages.length === 0) {
          console.log(chalk.yellow('📭 No messages found matching your filters.'));
          return;
        }

        // Resolve contact name
        const contactInfo = await contactResolver.resolveContact(normalizedIdentifier);
        const displayName = contactInfo.displayName;

        console.log(chalk.green(`✅ Found ${allMessages.length} total messages, showing ${limitedMessages.length}:`));
        console.log();

        // Display messages
        for (let i = 0; i < limitedMessages.length; i++) {
          const msg = limitedMessages[i];
          const direction = msg.isFromMe ? '➡️ YOU' : '⬅️ ' + displayName.toUpperCase();
          const timestamp = msg.date.toLocaleString();
          const timeAgo = getTimeAgo(msg.date);
          
          console.log(chalk.bold(`${i + 1}. ${direction}`));
          console.log(chalk.gray(`   ${timestamp} (${timeAgo})`));
          
          if (options.raw) {
            console.log(chalk.gray(`   Raw timestamp: ${msg.date.toISOString()}`));
            console.log(chalk.gray(`   GUID: ${msg.guid}`));
            console.log(chalk.gray(`   Handle ID: ${msg.handleId}`));
            console.log(chalk.gray(`   Chat ID: ${msg.chatIdentifier}`));
          }
          
          // Word wrap the message text
          const wrappedText = wrapText(msg.text, 80);
          console.log(chalk.white(`   "${wrappedText}"`));
          console.log();
        }

        // Show summary
        const sentCount = allMessages.filter(msg => msg.isFromMe).length;
        const receivedCount = allMessages.filter(msg => !msg.isFromMe).length;
        
        console.log(chalk.cyan('📊 Summary:'));
        console.log(chalk.gray(`   Total messages: ${allMessages.length}`));
        console.log(chalk.gray(`   Sent: ${sentCount}, Received: ${receivedCount}`));
        
        if (allMessages.length > 0) {
          const newest = allMessages[0];
          const oldest = allMessages[allMessages.length - 1];
          console.log(chalk.gray(`   Newest: ${newest.date.toLocaleString()}`));
          console.log(chalk.gray(`   Oldest: ${oldest.date.toLocaleString()}`));
        }

        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true });

      } catch (parseError) {
        console.error(chalk.red(`❌ Failed to parse messages: ${parseError}`));
        // Clean up temp directory on error
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Normalize phone number input to add +1 country code if needed
 */
function normalizePhoneInput(input: string): string {
  // If it's an email, return as-is
  if (input.includes('@')) {
    return input;
  }
  
  // Remove all non-digits
  const digits = input.replace(/\D/g, '');
  
  // Auto-add +1 for 10-digit US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // If it's 11 digits starting with 1, add +
  if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  
  // If it already starts with +, keep as-is
  if (input.startsWith('+')) {
    return input;
  }
  
  // For other cases, add + if it's all digits
  if (/^\d+$/.test(input.trim())) {
    return `+${input.trim()}`;
  }
  
  // Return original if we can't normalize
  return input;
}

/**
 * Calculate time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Wrap text to specified width
 */
function wrapText(text: string, width: number): string {
  if (text.length <= width) {
    return text;
  }
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).length <= width) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is longer than width, just add it
        lines.push(word);
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.join('\n   ');
}
