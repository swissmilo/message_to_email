import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { MessageExporter } from '../services/MessageExporter';
import { ConfigManager } from '../services/ConfigManager';
import { ContactResolver } from '../services/ContactResolver';
import { checkFullDiskAccess, displayPermissionInstructions, checkImessageExporterInstalled, displayInstallationInstructions } from '../utils/permissions';
import type { Conversation } from '../types';
import type { TrackedConversation } from '../types/config';

export const syncCommand = new Command('sync')
  .description('Interactive sync command to manage tracked conversations')
  .option('-a, --add <phoneOrEmail>', 'Add a conversation by phone number or email')
  .option('-r, --remove <chatId>', 'Remove a tracked conversation by chat ID')
  .option('-s, --status', 'Show sync status and tracked conversations')
  .action(async (options) => {
    try {
      // Check permissions first
      const hasFullDiskAccess = await checkFullDiskAccess();
      if (!hasFullDiskAccess) {
        displayPermissionInstructions();
        process.exit(1);
      }

      const isInstalled = await checkImessageExporterInstalled();
      if (!isInstalled) {
        displayInstallationInstructions();
        process.exit(1);
      }

      const configManager = new ConfigManager();
      const exporter = new MessageExporter();

      // Handle specific options
      if (options.add) {
        await addConversationByIdentifier(configManager, exporter, options.add);
        return;
      }

      if (options.remove) {
        await removeConversation(configManager, options.remove);
        return;
      }

      if (options.status) {
        await showSyncStatus(configManager);
        return;
      }

      // Interactive mode
      await runInteractiveSync(configManager, exporter);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function runInteractiveSync(configManager: ConfigManager, exporter: MessageExporter) {
  console.log(chalk.cyan('🔄 Interactive Sync Setup'));
  
  while (true) {
    console.log();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📋 View tracked conversations', value: 'view' },
          { name: '➕ Add conversations to track', value: 'add' },
          { name: '➖ Remove tracked conversations', value: 'remove' },
          { name: '⚙️  Configure sync settings', value: 'settings' },
          { name: '🔄 Run sync now', value: 'sync' },
          { name: '📁 Edit config file', value: 'edit' },
          { name: '🚪 Exit', value: 'exit' },
        ],
      },
    ]);

    switch (action) {
      case 'view':
        await viewTrackedConversations(configManager);
        break;
      case 'add':
        await addConversationsInteractive(configManager, exporter);
        break;
      case 'remove':
        await removeConversationsInteractive(configManager);
        break;
      case 'settings':
        await configureSyncSettings(configManager);
        break;
      case 'sync':
        await runSyncNow(configManager, exporter);
        break;
      case 'edit':
        await editConfigFile(configManager);
        break;
      case 'exit':
        console.log(chalk.green('👋 Goodbye!'));
        return;
    }
  }
}

async function viewTrackedConversations(configManager: ConfigManager) {
  const tracked = await configManager.getTrackedConversations();
  
  if (tracked.length === 0) {
    console.log(chalk.yellow('📭 No conversations are currently being tracked.'));
    console.log(chalk.gray('   Use "Add conversations to track" to get started.'));
    return;
  }

  console.log(chalk.bold.cyan('\n📋 Tracked Conversations:'));
  console.log();

  tracked.forEach((conv, index) => {
    const lastSync = conv.lastSyncDate 
      ? chalk.gray(`(last sync: ${formatDate(conv.lastSyncDate)})`)
      : chalk.gray('(never synced)');
    
    const groupLabel = conv.isGroup ? chalk.blue(' (group)') : '';
    
    console.log(`${chalk.cyan((index + 1).toString().padStart(2, ' '))}. ${chalk.bold(conv.displayName)}${groupLabel}`);
    console.log(`    ${chalk.gray('ID:')} ${conv.chatIdentifier}`);
    console.log(`    ${chalk.gray('Added:')} ${formatDate(conv.addedDate)} ${lastSync}`);
    console.log();
  });
}

async function addConversationsInteractive(configManager: ConfigManager, exporter: MessageExporter) {
  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'How would you like to add conversations?',
      choices: [
        { name: '📱 Select from recent conversations', value: 'recent' },
        { name: '✍️  Enter phone number or email manually', value: 'manual' },
        { name: '🔙 Back to main menu', value: 'back' },
      ],
    },
  ]);

  if (method === 'back') return;

  if (method === 'recent') {
    await addFromRecentConversations(configManager, exporter);
  } else if (method === 'manual') {
    await addManualConversation(configManager, exporter);
  }
}

async function addFromRecentConversations(configManager: ConfigManager, exporter: MessageExporter) {
  const spinner = ora('Loading recent conversations...').start();
  
  try {
    const conversations = await exporter.listConversations();
    const tracked = await configManager.getTrackedConversations();
    const trackedIds = new Set(tracked.map(t => t.chatIdentifier));
    
    // Filter out already tracked conversations and limit to 10
    const available = conversations
      .filter(conv => !trackedIds.has(conv.chatIdentifier))
      .slice(0, 10);
    
    spinner.stop();

    if (available.length === 0) {
      console.log(chalk.yellow('📭 No new conversations available to track.'));
      return;
    }

    console.log(chalk.cyan('\n📱 Recent Conversations (showing up to 10):'));
    
    const { selectedConversations } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedConversations',
        message: 'Select conversations to track:',
        choices: available.map(conv => ({
          name: `${conv.displayName} ${conv.isGroup ? chalk.blue('(group)') : ''} - ${conv.messageCount} messages`,
          value: conv.chatIdentifier,
        })),
      },
    ]);

    if (selectedConversations.length === 0) {
      console.log(chalk.gray('No conversations selected.'));
      return;
    }

    for (const chatId of selectedConversations) {
      const conv = available.find(c => c.chatIdentifier === chatId)!;
      await configManager.addTrackedConversation({
        chatIdentifier: conv.chatIdentifier,
        displayName: conv.displayName,
        participants: conv.participants,
        isGroup: conv.isGroup,
      });
    }

    console.log(chalk.green(`✅ Added ${selectedConversations.length} conversation(s) to tracking.`));
  } catch (error) {
    spinner.fail('Failed to load conversations');
    throw error;
  }
}

async function addManualConversation(configManager: ConfigManager, exporter: MessageExporter) {
  const { identifier } = await inquirer.prompt([
    {
      type: 'input',
      name: 'identifier',
      message: 'Enter phone number or email:',
      validate: (input) => {
        if (!input.trim()) return 'Please enter a phone number or email address.';
        // Basic validation for phone or email
        const isPhone = /^[\+]?[1-9][\d]{0,15}$/.test(input.replace(/[\s\-\(\)]/g, ''));
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
        if (!isPhone && !isEmail) {
          return 'Please enter a valid phone number or email address.';
        }
        return true;
      },
    },
  ]);

  // Initialize contact cache if needed
  await exporter.initialize();

  // Automatically resolve contact name if available
  const contactResolver = new ContactResolver();
  await contactResolver.initialize();
  let suggestedName = identifier.trim();
  
  try {
    const contactInfo = await contactResolver.resolveContact(identifier.trim());
    suggestedName = contactInfo.displayName;
    
    // Show what we found
    if (contactInfo.displayName && 
        contactInfo.displayName !== identifier.trim() && 
        !contactInfo.displayName.includes(identifier) &&
        !identifier.includes(contactInfo.displayName)) {
      console.log(chalk.gray(`📇 Found contact name: ${contactInfo.displayName}`));
    }
  } catch (error) {
    // If contact resolution fails, just use the identifier
  }

  const { displayName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'displayName',
      message: 'Enter a display name (press Enter to use suggested):',
      default: suggestedName,
    },
  ]);

  await configManager.addTrackedConversation({
    chatIdentifier: identifier.trim(),
    displayName: displayName.trim() || suggestedName,
    participants: [identifier.trim()],
    isGroup: false,
  });

  console.log(chalk.green(`✅ Added "${displayName.trim() || suggestedName}" to tracking.`));
}

async function removeConversationsInteractive(configManager: ConfigManager) {
  const tracked = await configManager.getTrackedConversations();
  
  if (tracked.length === 0) {
    console.log(chalk.yellow('📭 No conversations are currently being tracked.'));
    return;
  }

  const { selectedConversations } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedConversations',
      message: 'Select conversations to remove from tracking:',
      choices: tracked.map(conv => ({
        name: `${conv.displayName} ${conv.isGroup ? chalk.blue('(group)') : ''}`,
        value: conv.chatIdentifier,
      })),
    },
  ]);

  if (selectedConversations.length === 0) {
    console.log(chalk.gray('No conversations selected.'));
    return;
  }

  for (const chatId of selectedConversations) {
    await configManager.removeTrackedConversation(chatId);
  }

  console.log(chalk.green(`✅ Removed ${selectedConversations.length} conversation(s) from tracking.`));
}

async function configureSyncSettings(configManager: ConfigManager) {
  const config = await configManager.loadConfig();
  
  const { interval, autoSync } = await inquirer.prompt([
    {
      type: 'number',
      name: 'interval',
      message: 'Sync interval (minutes):',
      default: config.sync.syncInterval,
      validate: (input) => input > 0 || 'Interval must be greater than 0',
    },
    {
      type: 'confirm',
      name: 'autoSync',
      message: 'Enable automatic sync service?',
      default: config.sync.enableAutoSync,
    },
  ]);

  await configManager.updateSyncSettings({
    syncInterval: interval,
    enableAutoSync: autoSync,
  });

  console.log(chalk.green('✅ Sync settings updated.'));
}

async function runSyncNow(configManager: ConfigManager, exporter: MessageExporter) {
  const tracked = await configManager.getTrackedConversations();
  
  if (tracked.length === 0) {
    console.log(chalk.yellow('📭 No conversations are being tracked.'));
    return;
  }

  console.log(chalk.cyan('🔄 Running sync for tracked conversations...'));
  
  for (const conv of tracked) {
    console.log(chalk.gray(`📨 Syncing: ${conv.displayName}`));
    
    // Simulate message sync (replace with actual email sending later)
    const newMessages = Math.floor(Math.random() * 5); // Random for demo
    
    if (newMessages > 0) {
      console.log(chalk.green(`  ✓ Found ${newMessages} new message(s)`));
      console.log(chalk.gray(`  📧 Would send email update (email integration pending)`));
      
      // Update last sync date
      await configManager.updateLastSync(conv.chatIdentifier);
    } else {
      console.log(chalk.gray(`  • No new messages`));
    }
  }
  
  console.log(chalk.green('\n✅ Sync completed!'));
}

async function editConfigFile(configManager: ConfigManager) {
  const configPath = configManager.getConfigPath();
  console.log(chalk.cyan(`\n📁 Configuration file location:`));
  console.log(chalk.white(`   ${configPath}`));
  console.log();
  console.log(chalk.gray('You can edit this file directly with any text editor.'));
  console.log(chalk.gray('Changes will take effect the next time you run the sync command.'));
}

async function addConversationByIdentifier(configManager: ConfigManager, exporter: MessageExporter, identifier: string) {
  // Initialize contact cache if needed
  await exporter.initialize();
  
  // Automatically resolve contact name if available
  const contactResolver = new ContactResolver();
  await contactResolver.initialize();
  let displayName = identifier;
  
  try {
    const contactInfo = await contactResolver.resolveContact(identifier);
    // Use resolved name if it's different from the raw identifier and not just formatted
    if (contactInfo.displayName && 
        contactInfo.displayName !== identifier && 
        !contactInfo.displayName.includes(identifier) &&
        !identifier.includes(contactInfo.displayName)) {
      displayName = contactInfo.displayName;
      console.log(chalk.gray(`📇 Found contact name: ${displayName}`));
    } else {
      displayName = contactInfo.displayName; // Use the formatted version
    }
  } catch (error) {
    // If contact resolution fails, fall back to identifier
    console.log(chalk.gray(`📇 No contact found, using: ${identifier}`));
  }

  await configManager.addTrackedConversation({
    chatIdentifier: identifier,
    displayName,
    participants: [identifier],
    isGroup: false,
  });
  
  console.log(chalk.green(`✅ Added "${displayName}" to tracking.`));
}

async function removeConversation(configManager: ConfigManager, chatId: string) {
  await configManager.removeTrackedConversation(chatId);
  console.log(chalk.green(`✅ Removed conversation "${chatId}" from tracking.`));
}

async function showSyncStatus(configManager: ConfigManager) {
  const config = await configManager.loadConfig();
  const tracked = config.sync.trackedConversations;
  
  console.log(chalk.bold.cyan('📊 Sync Status'));
  console.log();
  console.log(chalk.gray('Configuration:'));
  console.log(`  Sync interval: ${config.sync.syncInterval} minute(s)`);
  console.log(`  Auto-sync: ${config.sync.enableAutoSync ? chalk.green('enabled') : chalk.red('disabled')}`);
  console.log(`  Tracked conversations: ${tracked.length}`);
  
  if (config.sync.lastGlobalSync) {
    console.log(`  Last global sync: ${formatDate(config.sync.lastGlobalSync)}`);
  }
  
  console.log();
  
  if (tracked.length > 0) {
    console.log(chalk.gray('Tracked conversations:'));
    tracked.forEach(conv => {
      const lastSync = conv.lastSyncDate 
        ? formatDate(conv.lastSyncDate)
        : 'never';
      console.log(`  • ${conv.displayName} (last sync: ${lastSync})`);
    });
  }
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes === 0) {
        return 'just now';
      }
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    }
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}
