import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { AppConfig, TrackedConversation, SyncConfig } from '../types/config';

export class ConfigManager {
  private configPath: string;
  private config: AppConfig | null = null;

  constructor() {
    // Store config in app directory
    this.configPath = path.join(process.cwd(), 'imessage-sync-config.json');
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(configData);
      
      // Convert date strings back to Date objects
      this.config = this.deserializeConfig(rawConfig);
      return this.config;
    } catch (error) {
      // Config file doesn't exist or is invalid, create default
      this.config = this.getDefaultConfig();
      await this.saveConfig();
      return this.config;
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config?: AppConfig): Promise<void> {
    if (config) {
      this.config = config;
    }

    if (!this.config) {
      throw new Error('No configuration to save');
    }

    // Convert Date objects to strings for JSON serialization
    const serializedConfig = this.serializeConfig(this.config);
    await fs.writeFile(this.configPath, JSON.stringify(serializedConfig, null, 2), 'utf-8');
  }

  /**
   * Add a conversation to tracking
   */
  async addTrackedConversation(conversation: Omit<TrackedConversation, 'addedDate'>): Promise<void> {
    const config = await this.loadConfig();
    
    // Check if already tracking this conversation
    const existingIndex = config.sync.trackedConversations.findIndex(
      tracked => tracked.chatIdentifier === conversation.chatIdentifier
    );

    const trackedConversation: TrackedConversation = {
      ...conversation,
      addedDate: new Date(),
    };

    if (existingIndex >= 0) {
      // Update existing
      config.sync.trackedConversations[existingIndex] = trackedConversation;
    } else {
      // Add new
      config.sync.trackedConversations.push(trackedConversation);
    }

    await this.saveConfig(config);
  }

  /**
   * Remove a conversation from tracking
   */
  async removeTrackedConversation(chatIdentifier: string): Promise<void> {
    const config = await this.loadConfig();
    config.sync.trackedConversations = config.sync.trackedConversations.filter(
      tracked => tracked.chatIdentifier !== chatIdentifier
    );
    await this.saveConfig(config);
  }

  /**
   * Get all tracked conversations
   */
  async getTrackedConversations(): Promise<TrackedConversation[]> {
    const config = await this.loadConfig();
    return config.sync.trackedConversations;
  }

  /**
   * Update last sync date for a conversation
   */
  async updateLastSync(chatIdentifier: string, lastMessageId?: string): Promise<void> {
    const config = await this.loadConfig();
    const conversation = config.sync.trackedConversations.find(
      tracked => tracked.chatIdentifier === chatIdentifier
    );

    if (conversation) {
      conversation.lastSyncDate = new Date();
      if (lastMessageId) {
        conversation.lastMessageId = lastMessageId;
      }
      await this.saveConfig(config);
    }
  }

  /**
   * Update global sync settings
   */
  async updateSyncSettings(settings: Partial<SyncConfig>): Promise<void> {
    const config = await this.loadConfig();
    config.sync = { ...config.sync, ...settings };
    await this.saveConfig(config);
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Create default configuration
   */
  private getDefaultConfig(): AppConfig {
    return {
      sync: {
        trackedConversations: [],
        syncInterval: 1, // 1 minute
        enableAutoSync: false,
        logLevel: 'info',
      },
      email: {
        enabled: true,
        fromName: 'iMessage Sync',
        recipientEmail: undefined, // Will use EMAIL_TO environment variable
      },
      export: {
        format: 'html',
        attachments: false,
        messageLimit: 1000,
      },
    };
  }

  /**
   * Convert date strings back to Date objects
   */
  private deserializeConfig(rawConfig: any): AppConfig {
    const defaultConfig = this.getDefaultConfig();
    const config: AppConfig = { 
      ...defaultConfig,
      ...rawConfig,
      sync: { ...defaultConfig.sync, ...rawConfig.sync },
      email: { ...defaultConfig.email, ...rawConfig.email },
      export: { ...defaultConfig.export, ...rawConfig.export },
    };
    
    // Convert date strings to Date objects
    if (config.sync.lastGlobalSync) {
      config.sync.lastGlobalSync = new Date(config.sync.lastGlobalSync);
    }

    config.sync.trackedConversations = config.sync.trackedConversations.map(conv => ({
      ...conv,
      addedDate: new Date(conv.addedDate),
      lastSyncDate: conv.lastSyncDate ? new Date(conv.lastSyncDate) : undefined,
    }));

    return config;
  }

  /**
   * Convert Date objects to strings for JSON serialization
   */
  private serializeConfig(config: AppConfig): any {
    return {
      ...config,
      sync: {
        ...config.sync,
        lastGlobalSync: config.sync.lastGlobalSync?.toISOString(),
        trackedConversations: config.sync.trackedConversations.map(conv => ({
          ...conv,
          addedDate: conv.addedDate.toISOString(),
          lastSyncDate: conv.lastSyncDate?.toISOString(),
        })),
      },
    };
  }
}
