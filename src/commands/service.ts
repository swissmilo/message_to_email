import { Command } from 'commander';
import chalk from 'chalk';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { MessageExporter } from '../services/MessageExporter';
import { ConfigManager } from '../services/ConfigManager';
import { GmailService } from '../services/GmailService';
import { checkFullDiskAccess, checkImessageExporterInstalled } from '../utils/permissions';

// Load environment variables
dotenv.config();

export const serviceCommand = new Command('service')
  .description('Run the sync service in the background')
  .option('-d, --daemon', 'Run as a daemon (detached process)')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--once', 'Run sync once and exit (for testing)')
  .action(async (options) => {
    try {
      // Check permissions
      const hasFullDiskAccess = await checkFullDiskAccess();
      if (!hasFullDiskAccess) {
        console.error(chalk.red('❌ Full Disk Access required. Please grant permission and restart.'));
        process.exit(1);
      }

      const isInstalled = await checkImessageExporterInstalled();
      if (!isInstalled) {
        console.error(chalk.red('❌ imessage-exporter not found. Please install it first.'));
        process.exit(1);
      }

      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      if (!config.sync.enableAutoSync) {
        console.log(chalk.yellow('⚠️  Auto-sync is disabled in configuration.'));
        console.log(chalk.gray('Run "imessage-sync sync" and enable auto-sync to use the service.'));
        process.exit(1);
      }

      if (config.sync.trackedConversations.length === 0) {
        console.log(chalk.yellow('⚠️  No conversations are being tracked.'));
        console.log(chalk.gray('Run "imessage-sync sync" to add conversations to track.'));
        process.exit(1);
      }

      console.log(chalk.cyan('🚀 Starting iMessage sync service...'));
      console.log(chalk.gray(`   Sync interval: ${config.sync.syncInterval} minute(s)`));
      console.log(chalk.gray(`   Tracking ${config.sync.trackedConversations.length} conversation(s)`));
      console.log(chalk.gray(`   Verbose logging: ${options.verbose ? 'enabled' : 'disabled'}`));
      console.log();

      const syncService = new SyncService(configManager, options.verbose);
      if (options.once) {
        // Run sync once and exit
        await syncService.runSyncOnce();
      } else {
        // Start the continuous service
        await syncService.start();
      }

    } catch (error) {
      console.error(chalk.red('Error starting service:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

class SyncService {
  private configManager: ConfigManager;
  private exporter: MessageExporter;
  private gmailService: GmailService | null = null;
  private verbose: boolean;
  private cronJob: any = null;
  private isRunning = false;

  constructor(configManager: ConfigManager, verbose = false) {
    this.configManager = configManager;
    this.exporter = new MessageExporter();
    this.verbose = verbose;
  }

  async start() {
    const config = await this.configManager.loadConfig();
    const cronExpression = `*/${config.sync.syncInterval} * * * *`; // Every N minutes

    // Initialize Gmail service if email is enabled
    if (config.email.enabled) {
      try {
        this.gmailService = new GmailService(config.email);
        await this.gmailService.initialize();
        this.log('info', '📧 Gmail service initialized');
      } catch (error) {
        this.log('error', `❌ Failed to initialize Gmail service: ${error}`);
        this.log('info', '📝 Running in simulation mode (no emails will be sent)');
      }
    } else {
      this.log('info', '📝 Email sending disabled - running in simulation mode');
    }

    this.log('info', `🔄 Service started with cron: ${cronExpression}`);
    
    // Set up graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    // Create cron job
    this.cronJob = cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        this.log('warn', '⚠️  Previous sync still running, skipping this interval');
        return;
      }
      
      await this.runSync();
    });

    // Run initial sync
    this.log('info', '🔄 Running initial sync...');
    await this.runSync();

    // Keep the process alive
    console.log(chalk.green('✅ Service is running. Press Ctrl+C to stop.'));
    
    // Prevent the process from exiting
    setInterval(() => {
      // Do nothing, just keep the process alive
    }, 1000);
  }

  async runSyncOnce() {
    const config = await this.configManager.loadConfig();

    // Initialize Gmail service if email is enabled
    if (config.email.enabled) {
      try {
        this.gmailService = new GmailService(config.email);
        await this.gmailService.initialize();
        this.log('info', '📧 Gmail service initialized');
      } catch (error) {
        this.log('error', `❌ Failed to initialize Gmail service: ${error}`);
        this.log('info', '📝 Running in simulation mode (no emails will be sent)');
      }
    } else {
      this.log('info', '📝 Email sending disabled - running in simulation mode');
    }

    // Initialize contact cache
    this.log('info', '📇 Initializing contact cache...');
    const exporter = new MessageExporter();
    await exporter.initialize();

    this.log('info', '🔄 Running single sync...');
    await this.runSync();
    this.log('info', '✅ Single sync completed');
  }

  async runSync() {
    this.isRunning = true;
    const startTime = new Date();
    
    try {
      const config = await this.configManager.loadConfig();
      const tracked = config.sync.trackedConversations;
      
      if (tracked.length === 0) {
        this.log('warn', '📭 No conversations to sync');
        return;
      }

      this.log('info', `🔄 Starting sync for ${tracked.length} conversation(s)...`);
      
      let totalNewMessages = 0;
      const conversationUpdates: Array<{
        chatIdentifier: string;
        lastSyncDate: Date;
        lastMessageId?: string;
      }> = [];
      
      for (const conv of tracked) {
        try {
          const newMessages = await this.syncConversation(conv);
          totalNewMessages += newMessages;
          
          if (newMessages > 0) {
            this.log('info', `📨 ${conv.displayName}: ${newMessages} new message(s)`);
            // Collect update for batch processing
            const syncTimestamp = new Date(Date.now() - 5000); // 5 second buffer
            conversationUpdates.push({
              chatIdentifier: conv.chatIdentifier,
              lastSyncDate: syncTimestamp,
            });
          } else if (this.verbose) {
            this.log('debug', `📨 ${conv.displayName}: no new messages`);
          }
        } catch (error) {
          this.log('error', `❌ Failed to sync ${conv.displayName}: ${error}`);
        }
      }
      
      const duration = new Date().getTime() - startTime.getTime();
      
      if (totalNewMessages > 0) {
        this.log('info', `✅ Sync completed: ${totalNewMessages} total new message(s) in ${duration}ms`);
      } else if (this.verbose) {
        this.log('debug', `✅ Sync completed: no new messages in ${duration}ms`);
      }
      
      // Batch update all changes at once to prevent overwriting external modifications
      await this.configManager.batchUpdateSync({
        conversationUpdates: conversationUpdates.length > 0 ? conversationUpdates : undefined,
        globalSettings: {
          lastGlobalSync: new Date(),
        },
      });
      
    } catch (error) {
      this.log('error', `❌ Sync failed: ${error}`);
    } finally {
      this.isRunning = false;
    }
  }

  async syncConversation(conv: any): Promise<number> {
    try {
      // Use a wider time window to ensure we don't miss recent messages
      // imessage-exporter seems to have issues with very recent timestamps
      let startDate = conv.lastSyncDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Add a 2-minute buffer to account for timing issues with imessage-exporter
      if (startDate) {
        startDate = new Date(startDate.getTime() - 2 * 60 * 1000); // 2 minutes earlier
      }
      
      this.log('debug', `🔍 Syncing ${conv.displayName}:`);
      this.log('debug', `   Last sync: ${conv.lastSyncDate ? conv.lastSyncDate.toISOString() : 'Never'}`);
      this.log('debug', `   Will filter locally for messages newer than: ${conv.lastSyncDate ? conv.lastSyncDate.toISOString() : 'Never'}`);
      
      // Export recent messages for this specific conversation
      // Remove date filters - imessage-exporter has issues with them, filter locally instead
      const tempDir = `temp_sync_${Date.now()}`;
      
      // Create temp directory before export
      const fs = await import('fs/promises');
      await fs.mkdir(tempDir, { recursive: true });
      
      const exportOptions = {
        format: 'html' as const,
        outputDir: tempDir,
        // Don't use startDate/endDate - causes issues with imessage-exporter
        noAttachments: true,
        contacts: conv.participants, // Filter to this conversation only
      };

      const exportResult = await this.exporter.exportMessages(exportOptions);
      if (!exportResult.success) {
        this.log('error', `❌ Export failed for ${conv.displayName}: ${exportResult.error}`);
        // Clean up temp directory on export failure
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        return 0;
      }

      // Parse the exported messages
      const path = await import('path');
      
      try {
        const files = await fs.readdir(tempDir);
        const htmlFiles = files.filter(file => file.endsWith('.html'));
        
        let totalNewMessages = 0;
        
        for (const htmlFile of htmlFiles) {
          const filePath = path.join(tempDir, htmlFile);
          const parsedData = await this.exporter.parseExportedData(filePath);
          
          for (const [chatId, messages] of parsedData.conversations) {
            if (messages.length > 0) {
              
              // Filter messages newer than last sync
              const newMessages = messages.filter(msg => {
                const isNew = !conv.lastSyncDate || msg.date > conv.lastSyncDate;
                if (this.verbose) {
                  const direction = msg.isFromMe ? '➡️ SENT' : '⬅️ RECEIVED';
                  this.log('debug', `   Message from ${msg.date.toISOString()}: ${isNew ? 'NEW' : 'OLD'} ${direction} - "${msg.text.substring(0, 30)}${msg.text.length > 30 ? '...' : ''}"`);
                }
                return isNew;
              });
              
              // Separate sent vs received messages for processing
              const newReceivedMessages = newMessages.filter(msg => !msg.isFromMe);
              const newSentMessages = newMessages.filter(msg => msg.isFromMe);
              
              this.log('debug', `   Filtered to ${newMessages.length} new message(s) (${newReceivedMessages.length} received, ${newSentMessages.length} sent)`);
              
              // Log all new messages for visibility
              if (newMessages.length > 0) {
                if (newSentMessages.length > 0) {
                  this.log('info', `📤 You sent ${newSentMessages.length} message(s) to ${conv.displayName}`);
                  if (this.verbose) {
                    newSentMessages.forEach(msg => {
                      this.log('debug', `   📤 [${msg.date.toLocaleTimeString()}] You: "${msg.text.substring(0, 60)}${msg.text.length > 60 ? '...' : ''}"`);
                    });
                  }
                }
                
                // Only send emails for received messages
                if (newReceivedMessages.length > 0) {
                  if (this.gmailService) {
                    // Send emails for received messages only
                    const emails = this.gmailService.convertConversationToEmail(
                      newReceivedMessages,
                      conv.displayName,
                      conv.chatIdentifier
                    );
                    
                    for (const email of emails) {
                      try {
                        await this.gmailService.sendEmail(email);
                        this.log('info', `📧 Email sent for message from ${conv.displayName}`);
                      } catch (emailError) {
                        this.log('error', `❌ Failed to send email: ${emailError}`);
                      }
                    }
                  } else {
                    // Simulation mode
                    this.log('info', `📧 [SIMULATION] Would send ${newReceivedMessages.length} email(s) from ${conv.displayName}`);
                    for (const msg of newReceivedMessages) {
                      this.log('debug', `📧 [SIMULATION] Message: "${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"`);
                    }
                  }
                }
              }
                
              totalNewMessages += newMessages.length;
            }
          }
        }
        
        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
        
        return totalNewMessages;
        
      } catch (parseError) {
        this.log('error', `❌ Failed to parse exported messages: ${parseError}`);
        // Clean up temp directory on error
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        return 0;
      }
      
    } catch (error) {
      this.log('error', `❌ Sync error for ${conv.displayName}: ${error}`);
      return 0;
    }
  }

  shutdown() {
    console.log();
    this.log('info', '🛑 Shutting down service...');
    
    if (this.cronJob) {
      this.cronJob.stop();
      // Note: node-cron doesn't have a destroy() method, stop() is sufficient
    }
    
    this.log('info', '👋 Service stopped');
    process.exit(0);
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}]`;
    
    switch (level) {
      case 'info':
        console.log(chalk.gray(prefix), chalk.cyan(message));
        break;
      case 'warn':
        console.log(chalk.gray(prefix), chalk.yellow(message));
        break;
      case 'error':
        console.log(chalk.gray(prefix), chalk.red(message));
        break;
      case 'debug':
        if (this.verbose) {
          console.log(chalk.gray(prefix), chalk.gray(message));
        }
        break;
    }
  }
}
