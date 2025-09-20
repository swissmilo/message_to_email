export interface Message {
  guid: string;
  text: string;
  date: Date;
  isFromMe: boolean;
  handleId: string;
  chatIdentifier: string;
  attachments?: Attachment[];
}

export interface Attachment {
  filename: string;
  mimeType: string;
  transferName: string;
}

export interface Conversation {
  chatIdentifier: string;
  displayName: string;
  participants: string[];
  lastMessageDate: Date;
  messageCount: number;
  isGroup: boolean;
}

export interface ExportOptions {
  format: 'html' | 'txt';
  contacts?: string[];
  startDate?: Date;
  endDate?: Date;
  outputDir: string;
  noAttachments?: boolean;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  messageCount: number;
  error?: string;
}

export interface ParsedMessages {
  conversations: Map<string, Message[]>;
  totalMessages: number;
}
