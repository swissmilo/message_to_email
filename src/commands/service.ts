import { Command } from 'commander';
import chalk from 'chalk';
import cron from 'node-cron';
import { MessageExporter } from '../services/MessageExporter';
import { ConfigManager } from '../services/ConfigManager';
import { checkFullDiskAccess, checkImessageExporterInstalled } from '../utils/permissions';

export const serviceCommand = new Command('service')
  .description('Run the sync service in the background')
  .option('-d, --daemon', 'Run as a daemon (detached process)')
  .option('-v, --verbose', 'Enable verbose logging')
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
      await syncService.start();

    } catch (error) {
      console.error(chalk.red('Error starting service:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

class SyncService {
  private configManager: ConfigManager;
  private exporter: MessageExporter;
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
      
      for (const conv of tracked) {
        try {
          const newMessages = await this.syncConversation(conv);
          totalNewMessages += newMessages;
          
          if (newMessages > 0) {
            this.log('info', `📨 ${conv.displayName}: ${newMessages} new message(s)`);
            // Update last sync date
            await this.configManager.updateLastSync(conv.chatIdentifier);
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
      
      // Update global sync timestamp
      await this.configManager.updateSyncSettings({
        lastGlobalSync: new Date(),
      });
      
    } catch (error) {
      this.log('error', `❌ Sync failed: ${error}`);
    } finally {
      this.isRunning = false;
    }
  }

  async syncConversation(conv: any): Promise<number> {
    // For now, simulate finding new messages
    // In a real implementation, this would:
    // 1. Export messages for this specific conversation since last sync
    // 2. Compare with last known message ID
    // 3. Process new messages and send emails
    // 4. Update last message ID
    
    const newMessages = Math.floor(Math.random() * 3); // Random 0-2 new messages for demo
    
    if (newMessages > 0) {
      // Simulate processing messages
      for (let i = 0; i < newMessages; i++) {
        const messageContent = `[DEMO] New message ${i + 1} from ${conv.displayName}`;
        this.log('info', `📧 Would send email: ${messageContent}`);
      }
    }
    
    return newMessages;
  }

  shutdown() {
    console.log();
    this.log('info', '🛑 Shutting down service...');
    
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob.destroy();
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
