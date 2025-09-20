import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Message } from '../types';
import type { EmailConfig } from '../types/config';

export interface EmailMessage {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  conversationId: string;
}

export class GmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  /**
   * Initialize the Gmail transporter
   */
  async initialize(): Promise<void> {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPassword) {
      throw new Error(
        'Gmail credentials not found. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.\n' +
        'See env.example for setup instructions.'
      );
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
    });

    // Test the connection
    try {
      if (this.transporter) {
        await this.transporter.verify();
        console.log('✅ Gmail connection verified');
      }
    } catch (error) {
      throw new Error(
        `Failed to connect to Gmail: ${error}\n` +
        'Please check your Gmail credentials and app password.'
      );
    }
  }

  /**
   * Send an email message
   */
  async sendEmail(emailMessage: EmailMessage): Promise<void> {
    if (!this.transporter) {
      throw new Error('Gmail service not initialized. Call initialize() first.');
    }

    const recipientEmail = this.config.recipientEmail || process.env.EMAIL_TO;
    if (!recipientEmail) {
      throw new Error('No recipient email configured. Set EMAIL_TO environment variable or configure in settings.');
    }

    const mailOptions = {
      from: `"${this.config.fromName}" <${process.env.GMAIL_USER}>`,
      to: recipientEmail,
      subject: emailMessage.subject,
      text: emailMessage.textBody,
      html: emailMessage.htmlBody,
      messageId: emailMessage.messageId,
      inReplyTo: emailMessage.inReplyTo,
      references: emailMessage.references?.join(' '),
      headers: {
        'X-Conversation-ID': emailMessage.conversationId,
        'X-iMessage-Sync': 'true',
      },
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Email sent: ${info.messageId}`);
    } catch (error) {
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  /**
   * Convert iMessage conversation to email format
   */
  convertConversationToEmail(
    messages: Message[],
    conversationDisplayName: string,
    conversationId: string
  ): EmailMessage[] {
    if (messages.length === 0) {
      return [];
    }

    // Sort messages by date
    const sortedMessages = [...messages].sort((a, b) => a.date.getTime() - b.date.getTime());
    
    const emails: EmailMessage[] = [];
    let previousMessageId: string | undefined;
    const allMessageIds: string[] = [];

    for (let i = 0; i < sortedMessages.length; i++) {
      const message = sortedMessages[i];
      const messageId = this.generateMessageId(message.guid, conversationId);
      allMessageIds.push(messageId);

      // Create subject with phone number always included for filtering
      const subject = i === 0 
        ? this.createEmailSubject(conversationDisplayName, conversationId)
        : `Re: ${this.createEmailSubject(conversationDisplayName, conversationId)}`;

      const htmlBody = this.formatMessageAsHTML(message, conversationDisplayName);
      const textBody = this.formatMessageAsText(message, conversationDisplayName);

      emails.push({
        to: '', // Will be set by sendEmail
        subject,
        htmlBody,
        textBody,
        messageId,
        inReplyTo: previousMessageId,
        references: previousMessageId ? allMessageIds.slice(0, -1) : undefined,
        conversationId,
      });

      previousMessageId = messageId;
    }

    return emails;
  }

  /**
   * Create email subject with phone number for filtering
   */
  private createEmailSubject(conversationDisplayName: string, conversationId: string): string {
    // Extract the raw identifier (phone number or email)
    const rawIdentifier = conversationId;
    
    // If the display name is different from the raw identifier, include both
    if (conversationDisplayName !== rawIdentifier && 
        !conversationDisplayName.includes(rawIdentifier) &&
        !rawIdentifier.includes(conversationDisplayName)) {
      
      // Check if it's a phone number or email
      if (rawIdentifier.includes('@')) {
        return `iMessage: ${conversationDisplayName} (${rawIdentifier})`;
      } else {
        // It's a phone number - format it nicely
        const formattedPhone = this.formatPhoneForSubject(rawIdentifier);
        return `iMessage: ${conversationDisplayName} (${formattedPhone})`;
      }
    }
    
    // If display name is the same as identifier, just use it
    return `iMessage: ${conversationDisplayName}`;
  }

  /**
   * Format phone number for email subject
   */
  private formatPhoneForSubject(phone: string): string {
    // Remove non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Add +1 if no country code and it's a 10-digit US number
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    
    // If it already starts with 1 and is 11 digits, add +
    if (digits.length === 11 && digits[0] === '1') {
      return `+${digits}`;
    }
    
    // Return as-is with + if it doesn't already have it
    return phone.startsWith('+') ? phone : `+${phone}`;
  }

  /**
   * Format a single message as HTML
   */
  private formatMessageAsHTML(message: Message, conversationName: string): string {
    const timestamp = message.date.toLocaleString();
    const sender = message.isFromMe ? 'You' : message.handleId;
    const direction = message.isFromMe ? 'sent' : 'received';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 20px; }
        .message-container { max-width: 600px; margin: 0 auto; }
        .header { border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 20px; }
        .conversation-name { font-size: 18px; font-weight: bold; color: #333; }
        .message { background: ${message.isFromMe ? '#007AFF' : '#E5E5EA'}; 
                   color: ${message.isFromMe ? 'white' : 'black'};
                   padding: 12px 16px; border-radius: 18px; margin: 10px 0;
                   max-width: 70%; word-wrap: break-word;
                   ${message.isFromMe ? 'margin-left: auto; text-align: right;' : 'margin-right: auto;'} }
        .sender { font-size: 12px; color: #666; margin-bottom: 5px; }
        .timestamp { font-size: 11px; color: #999; margin-top: 5px; }
        .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; 
                  font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="message-container">
        <div class="header">
            <div class="conversation-name">${conversationName}</div>
        </div>
        
        <div class="sender">${sender}</div>
        <div class="message">${this.escapeHtml(message.text)}</div>
        <div class="timestamp">${timestamp}</div>
        
        <div class="footer">
            Synced from iMessage • Message ${direction} ${timestamp}
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Format a single message as plain text
   */
  private formatMessageAsText(message: Message, conversationName: string): string {
    const timestamp = message.date.toLocaleString();
    const sender = message.isFromMe ? 'You' : message.handleId;
    const direction = message.isFromMe ? 'sent' : 'received';

    return `iMessage Conversation: ${conversationName}

From: ${sender}
Date: ${timestamp}

${message.text}

---
Synced from iMessage • Message ${direction} ${timestamp}`;
  }

  /**
   * Generate a unique Message-ID for email threading
   */
  private generateMessageId(messageGuid: string, conversationId: string): string {
    // Create a unique message ID for email threading
    const cleanGuid = messageGuid.replace(/[^a-zA-Z0-9]/g, '');
    const cleanConvId = conversationId.replace(/[^a-zA-Z0-9]/g, '');
    return `<imessage-${cleanConvId}-${cleanGuid}@imessage-sync.local>`;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const div = { innerHTML: text } as any;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Test email sending
   */
  async testEmailSending(): Promise<void> {
    const testMessage: EmailMessage = {
      to: '',
      subject: 'iMessage Sync Test',
      htmlBody: `
        <h2>✅ iMessage Sync Test Email</h2>
        <p>This is a test email from your iMessage sync service.</p>
        <p>If you're receiving this, your Gmail configuration is working correctly!</p>
        <p><em>Sent at: ${new Date().toLocaleString()}</em></p>
      `,
      textBody: `✅ iMessage Sync Test Email

This is a test email from your iMessage sync service.
If you're receiving this, your Gmail configuration is working correctly!

Sent at: ${new Date().toLocaleString()}`,
      messageId: `<test-${Date.now()}@imessage-sync.local>`,
      conversationId: 'test',
    };

    await this.sendEmail(testMessage);
  }
}
