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

export interface AppConfig {
  sync: SyncConfig;
  gmail?: {
    email?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
  };
  export: {
    format: 'html' | 'txt';
    attachments: boolean;
    messageLimit?: number;
  };
}
