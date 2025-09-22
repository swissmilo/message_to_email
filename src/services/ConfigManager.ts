import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { AppConfig, TrackedConversation, SyncConfig } from '../types/config';

export class ConfigManager {
  private configPath: string;
  private config: AppConfig | null = null;
  private lastModified: Date | null = null;

  constructor() {
    // Store config in app directory
    this.configPath = path.join(process.cwd(), 'imessage-sync-config.json');
  }

  /**
   * Load configuration from file (checks for external modifications)
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      // Check if config file has been modified since we last read it
      const stats = await fs.stat(this.configPath);
      const fileModified = stats.mtime;
      
      if (this.config && this.lastModified && fileModified <= this.lastModified) {
        // File hasn't changed, return cached config
        return this.config;
      }
      
      // File has changed or we haven't loaded it yet, read from disk
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(configData);
      
      // Convert date strings back to Date objects
      this.config = this.deserializeConfig(rawConfig);
      this.lastModified = fileModified;
      
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
    
    // Update our timestamp tracking after writing
    try {
      const stats = await fs.stat(this.configPath);
      this.lastModified = stats.mtime;
    } catch (error) {
      // If we can't get the timestamp, clear it so we'll re-read next time
      this.lastModified = null;
    }
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

    const now = new Date();
    const trackedConversation: TrackedConversation = {
      ...conversation,
      addedDate: now,
      lastSyncDate: now, // Set to now so we only email new messages going forward
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

  async updateLastSyncWithTimestamp(chatIdentifier: string, timestamp: Date, lastMessageId?: string): Promise<void> {
    const config = await this.loadConfig();
    const conversation = config.sync.trackedConversations.find(
      tracked => tracked.chatIdentifier === chatIdentifier
    );

    if (conversation) {
      conversation.lastSyncDate = timestamp;
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
   * Batch update: update multiple conversation sync dates and global settings at once
   * This prevents multiple file writes that could overwrite external changes
   */
  async batchUpdateSync(updates: {
    conversationUpdates?: Array<{
      chatIdentifier: string;
      lastSyncDate: Date;
      lastMessageId?: string;
    }>;
    globalSettings?: Partial<SyncConfig>;
  }): Promise<void> {
    const config = await this.loadConfig();
    
    // Apply conversation updates
    if (updates.conversationUpdates) {
      for (const update of updates.conversationUpdates) {
        const conversation = config.sync.trackedConversations.find(
          tracked => tracked.chatIdentifier === update.chatIdentifier
        );
        if (conversation) {
          conversation.lastSyncDate = update.lastSyncDate;
          if (update.lastMessageId) {
            conversation.lastMessageId = update.lastMessageId;
          }
        }
      }
    }
    
    // Apply global settings
    if (updates.globalSettings) {
      config.sync = { ...config.sync, ...updates.globalSettings };
    }
    
    // Save once at the end
    await this.saveConfig(config);
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Normalize phone number for consistent matching
   * Handles formats: +14155219639, (415) 521-9639, 415-521-9639, etc.
   */
  private normalizePhoneNumber(phone: string): string {
    if (phone.includes('@')) {
      return phone; // Email addresses don't need normalization
    }
    
    // Extract only digits
    const digits = phone.replace(/\D/g, '');
    
    // Auto-add country code for 10-digit US numbers
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    // Format 11-digit numbers starting with 1
    else if (digits.length === 11 && digits[0] === '1') {
      return `+${digits}`;
    }
    // For other lengths, preserve but add + if missing
    else if (digits.length > 10) {
      return phone.startsWith('+') ? phone : `+${digits}`;
    }
    
    // Fallback: return original for short/invalid numbers
    return phone;
  }

  /**
   * Find tracked conversation by identifier, handling different phone number formats
   */
  findTrackedConversation(identifier: string): TrackedConversation | undefined {
    if (!this.config) return undefined;
    
    const normalizedIdentifier = this.normalizePhoneNumber(identifier);
    
    return this.config.sync.trackedConversations.find(conv => {
      // Try exact match first
      if (conv.chatIdentifier === identifier) return true;
      
      // Try normalized phone number match
      const normalizedChatId = this.normalizePhoneNumber(conv.chatIdentifier);
      if (normalizedChatId === normalizedIdentifier) return true;
      
      // Try participant matching
      return conv.participants.some(participant => {
        if (participant === identifier) return true;
        const normalizedParticipant = this.normalizePhoneNumber(participant);
        return normalizedParticipant === normalizedIdentifier;
      });
    });
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
