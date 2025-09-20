export interface TrackedConversation {
  chatIdentifier: string;
  displayName: string;
  participants: string[];
  isGroup: boolean;
  addedDate: Date;
  lastSyncDate?: Date;
  lastMessageId?: string;
}

export interface SyncConfig {
  trackedConversations: TrackedConversation[];
  syncInterval: number; // minutes
  lastGlobalSync?: Date;
  enableAutoSync: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export interface EmailConfig {
  enabled: boolean;
  fromName: string;
  recipientEmail?: string; // If not set, will use environment variable
}

export interface AppConfig {
  sync: SyncConfig;
  email: EmailConfig;
  export: {
    format: 'html' | 'txt';
    attachments: boolean;
    messageLimit?: number;
  };
}
