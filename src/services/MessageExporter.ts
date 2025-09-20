import { spawn } from 'child_process';
import { parse } from 'node-html-parser';
import { promises as fs } from 'fs';
import path from 'path';
import type { ExportOptions, ExportResult, Conversation, ParsedMessages, Message } from '../types';

export class MessageExporter {
  private binaryPath: string;

  constructor(binaryPath: string = 'imessage-exporter') {
    this.binaryPath = binaryPath;
  }

  /**
   * Check if imessage-exporter is installed and accessible
   */
  async checkInstallation(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.binaryPath, ['--version']);
      proc.on('error', () => resolve(false));
      proc.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * List all conversations available in the Messages database
   */
  async listConversations(): Promise<Conversation[]> {
    try {
      // Try to export recent messages and parse them
      console.log('🔍 Attempting to access Messages database...');
      
      try {
        console.log('🔄 Exporting recent messages (last 30 days)...');
        const conversations = await this.exportAndParseConversations();
        if (conversations.length > 0) {
          console.log(`✅ Successfully parsed ${conversations.length} real conversations!`);
          return conversations;
        }
      } catch (exportError) {
        console.log('⚠️  Export approach failed:', exportError);
      }

      // Fallback: Return empty list with explanation
      console.log('\n❌ Export failed. This could be due to:');
      console.log('   • Messages app is currently running (try closing it)');
      console.log('   • Database is locked by another process');
      console.log('   • Additional permissions needed beyond Full Disk Access');
      console.log('\n📝 Showing sample data for demonstration purposes:\n');

      return this.getSampleConversations();
    } catch (error) {
      throw new Error(`Failed to list conversations: ${error}`);
    }
  }

  /**
   * Export messages and parse the HTML to extract conversations
   */
  private async exportAndParseConversations(): Promise<Conversation[]> {
    const tempDir = path.join(process.cwd(), 'temp_export');
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Export last 30 days of messages
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);

      const exportOptions: ExportOptions = {
        format: 'html',
        outputDir: tempDir,
        startDate,
        endDate,
        noAttachments: true
      };

      const result = await this.exportMessages(exportOptions);
      
      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      // Parse all HTML files to extract conversations
      const conversations = await this.parseExportDirectory(tempDir);
      
      return conversations;
    } finally {
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.log('Warning: Could not clean up temp directory:', cleanupError);
      }
    }
  }

  /**
   * Parse the export directory to extract all conversations
   */
  private async parseExportDirectory(exportDir: string): Promise<Conversation[]> {
    const files = await fs.readdir(exportDir);
    const htmlFiles = files.filter(file => file.endsWith('.html'));
    
    const conversations: Conversation[] = [];
    
    for (const htmlFile of htmlFiles) {
      try {
        const filePath = path.join(exportDir, htmlFile);
        const conversation = await this.parseConversationFile(filePath, htmlFile);
        if (conversation) {
          conversations.push(conversation);
        }
      } catch (error) {
        console.log(`Warning: Could not parse ${htmlFile}:`, error);
      }
    }

    return conversations.sort((a, b) => 
      b.lastMessageDate.getTime() - a.lastMessageDate.getTime()
    );
  }

  /**
   * Parse a single conversation HTML file
   */
  private async parseConversationFile(filePath: string, filename: string): Promise<Conversation | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const root = parse(content);
    
    // Extract participants from filename (remove .html extension)
    const chatIdentifier = filename.replace('.html', '');
    const participants = this.extractParticipantsFromFilename(chatIdentifier);
    
    // Find all message elements
    const messageElements = root.querySelectorAll('.message');
    if (messageElements.length === 0) {
      return null;
    }
    
    // Parse messages to get metadata
    const messages = [];
    let lastMessageDate = new Date(0);
    
    for (const messageEl of messageElements) {
      try {
        const message = this.parseMessageFromHTMLElement(messageEl, chatIdentifier);
        if (message) {
          messages.push(message);
          if (message.date > lastMessageDate) {
            lastMessageDate = message.date;
          }
        }
      } catch (error) {
        // Skip invalid messages
      }
    }
    
    if (messages.length === 0) {
      return null;
    }

    return {
      chatIdentifier,
      displayName: this.getDisplayName(chatIdentifier, participants),
      participants,
      lastMessageDate,
      messageCount: messages.length,
      isGroup: participants.length > 1,
    };
  }

  /**
   * Extract participants from filename
   */
  private extractParticipantsFromFilename(filename: string): string[] {
    // Handle different filename formats:
    // "+14156300688" -> ["+14156300688"]
    // "+14156300688, +19145889464" -> ["+14156300688", "+19145889464"]
    // "sarah.leboulanger@gmail.com" -> ["sarah.leboulanger@gmail.com"]
    
    if (filename.includes(', ')) {
      return filename.split(', ').map(p => p.trim());
    }
    
    return [filename];
  }

  /**
   * Parse a message from HTML element
   */
  private parseMessageFromHTMLElement(element: any, chatId: string): Message | null {
    try {
      // Find the timestamp
      const timestampEl = element.querySelector('.timestamp a');
      let date = new Date();
      if (timestampEl) {
        const timestampText = timestampEl.textContent;
        if (timestampText) {
          // Parse timestamp like "Sep 01, 2024  3:02:25 PM"
          date = new Date(timestampText);
        }
      }
      
      // Find the message content
      const bubbleEl = element.querySelector('.bubble');
      const text = bubbleEl ? bubbleEl.textContent?.trim() || '' : '';
      
      // Determine if message is sent or received
      const isFromMe = element.querySelector('.sent') !== null;
      
      // Find sender
      const senderEl = element.querySelector('.sender');
      const handleId = senderEl ? senderEl.textContent?.trim() || 'unknown' : 'unknown';
      
      if (!text) {
        return null; // Skip messages without text (e.g., attachments only)
      }

      return {
        guid: Math.random().toString(36),
        text,
        date,
        isFromMe,
        handleId,
        chatIdentifier: chatId,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get sample conversations for demonstration
   */
  private getSampleConversations(): Conversation[] {
    const now = new Date();
    return [
      {
        chatIdentifier: 'sample001',
        displayName: 'Sample Contact 1',
        participants: ['contact1@example.com'],
        lastMessageDate: new Date(now.getTime() - 1000 * 60 * 30), // 30 minutes ago
        messageCount: 15,
        isGroup: false,
      },
      {
        chatIdentifier: 'sample002',
        displayName: '(555) 123-4567',
        participants: ['+15551234567'],
        lastMessageDate: new Date(now.getTime() - 1000 * 60 * 60 * 2), // 2 hours ago
        messageCount: 8,
        isGroup: false,
      },
      {
        chatIdentifier: 'sample003',
        displayName: 'Sample Group (3 people)',
        participants: ['person1@example.com', 'person2@example.com', 'person3@example.com'],
        lastMessageDate: new Date(now.getTime() - 1000 * 60 * 60 * 24), // 1 day ago
        messageCount: 42,
        isGroup: true,
      },
    ];
  }

  /**
   * Export messages based on the provided options
   */
  async exportMessages(options: ExportOptions): Promise<ExportResult> {
    const args = this.buildExportArgs(options);
    
    try {
      const result = await this.executeCommand(args);
      
      return {
        success: true,
        outputPath: options.outputDir,
        messageCount: this.extractMessageCount(result.output),
      };
    } catch (error) {
      return {
        success: false,
        outputPath: options.outputDir,
        messageCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse exported HTML file to extract structured message data
   */
  async parseExportedData(filePath: string): Promise<ParsedMessages> {
    const content = await fs.readFile(filePath, 'utf-8');
    const root = parse(content);
    
    const conversations = new Map<string, Message[]>();
    let totalMessages = 0;

    // Parse HTML structure created by imessage-exporter
    const messageElements = root.querySelectorAll('.message');
    
    for (const element of messageElements) {
      const message = this.parseMessageFromHTMLElement(element, 'unknown');
      if (message) {
        const chatMessages = conversations.get(message.chatIdentifier) || [];
        chatMessages.push(message);
        conversations.set(message.chatIdentifier, chatMessages);
        totalMessages++;
      }
    }

    return { conversations, totalMessages };
  }

  /**
   * Execute imessage-exporter command
   */
  private executeCommand(args: string[]): Promise<{ output: string; error: string }> {
    return new Promise((resolve, reject) => {
      let output = '';
      let error = '';

      const proc = spawn(this.binaryPath, args);

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        error += data.toString();
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to execute imessage-exporter: ${err.message}`));
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve({ output, error });
        } else {
          reject(new Error(`imessage-exporter exited with code ${code}: ${error}`));
        }
      });
    });
  }

  /**
   * Build command line arguments for export
   */
  private buildExportArgs(options: ExportOptions): string[] {
    const args: string[] = [];

    // Output format
    args.push('--format', options.format);

    // Output directory
    args.push('--export-path', options.outputDir);

    // Date range (format: YYYY-MM-DD)
    if (options.startDate) {
      args.push('--start-date', options.startDate.toISOString().split('T')[0]);
    }
    if (options.endDate) {
      args.push('--end-date', options.endDate.toISOString().split('T')[0]);
    }

    // Contacts filter
    if (options.contacts && options.contacts.length > 0) {
      args.push('--conversation-filter', options.contacts.join(','));
    }

    // Disable attachments
    if (options.noAttachments) {
      args.push('--copy-method', 'disabled');
    }

    return args;
  }


  /**
   * Generate a display name for a conversation
   */
  private getDisplayName(chatId: string, participants: string[]): string {
    if (participants.length === 0) {
      return 'Unknown';
    }
    
    if (participants.length === 1) {
      // Single participant - try to format phone number or email nicely
      const participant = participants[0];
      if (participant.includes('@')) {
        return participant; // Email address
      } else if (participant.match(/^\+?\d+$/)) {
        // Phone number - format it nicely
        return this.formatPhoneNumber(participant);
      }
      return participant;
    }
    
    // Group conversation
    return `Group (${participants.length} people)`;
  }

  /**
   * Format phone number for display
   */
  private formatPhoneNumber(phone: string): string {
    // Remove non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format US phone numbers
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    // Return original if we can't format it
    return phone;
  }

  /**
   * Extract message count from command output
   */
  private extractMessageCount(output: string): number {
    const match = output.match(/Exported (\d+) messages/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
