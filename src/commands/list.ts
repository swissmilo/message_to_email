import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { MessageExporter } from '../services/MessageExporter';
import { checkFullDiskAccess, displayPermissionInstructions, checkImessageExporterInstalled, displayInstallationInstructions } from '../utils/permissions';
import type { Conversation } from '../types';

export const listCommand = new Command('list')
  .description('List recent message threads')
  .option('-l, --limit <number>', 'Number of conversations to display', '20')
  .option('-g, --groups', 'Include group conversations', false)
  .action(async (options) => {
    try {
      console.log(chalk.cyan('🔍 Checking permissions and dependencies...\n'));

      // Check permissions
      console.log(chalk.gray('• Checking Full Disk Access...'));
      const hasFullDiskAccess = await checkFullDiskAccess();
      if (!hasFullDiskAccess) {
        console.log(chalk.red('  ✗ Full Disk Access denied'));
        displayPermissionInstructions();
        process.exit(1);
      }
      console.log(chalk.green('  ✓ Full Disk Access granted'));

      // Check if imessage-exporter is installed
      console.log(chalk.gray('• Checking imessage-exporter installation...'));
      const isInstalled = await checkImessageExporterInstalled();
      if (!isInstalled) {
        console.log(chalk.red('  ✗ imessage-exporter not found'));
        displayInstallationInstructions();
        process.exit(1);
      }
      console.log(chalk.green('  ✓ imessage-exporter found'));

      // Initialize exporter
      const exporter = new MessageExporter();
      
      // Start loading spinner
      console.log(chalk.gray('• Testing database access...\n'));
      const spinner = ora('Running diagnostics and loading conversations...').start();

      try {
        // Get conversations
        const conversations = await exporter.listConversations();
        spinner.succeed('Loaded conversations');

        // Filter and limit conversations
        let filteredConversations = conversations;
        if (!options.groups) {
          filteredConversations = conversations.filter(conv => !conv.isGroup);
        }

        const limit = parseInt(options.limit, 10);
        const displayConversations = filteredConversations.slice(0, limit);

        // Display results
        console.log(`\n${chalk.bold.cyan('Recent Message Threads')}\n`);
        
        if (displayConversations.length === 0) {
          console.log(chalk.yellow('No conversations found.'));
          return;
        }

        displayConversations.forEach((conv, index) => {
          const number = chalk.gray(`${(index + 1).toString().padStart(2, ' ')}.`);
          const name = chalk.bold(conv.displayName || 'Unknown');
          const participants = conv.isGroup 
            ? chalk.gray(` (${conv.participants.length} participants)`)
            : '';
          const lastMessage = chalk.gray(formatDate(conv.lastMessageDate));
          
          console.log(`${number} ${name}${participants}`);
          console.log(`    ${lastMessage}`);
          console.log(`    ${chalk.gray(conv.chatIdentifier)}`);
          console.log();
        });

        console.log(chalk.gray(`\nShowing ${displayConversations.length} of ${filteredConversations.length} conversations`));
        
      } catch (error) {
        spinner.fail('Failed to load conversations');
        console.error(chalk.red('\nError:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes === 0) {
        return 'Just now';
      }
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    }
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  } else {
    return date.toLocaleDateString();
  }
}
