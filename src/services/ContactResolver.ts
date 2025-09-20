import { spawn } from 'child_process';

export interface ContactInfo {
  phoneNumber?: string;
  email?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

export class ContactResolver {
  private contactCache = new Map<string, ContactInfo>();
  private manualContacts = new Map<string, string>(); // identifier -> display name

  constructor() {
    this.loadManualContacts();
  }

  /**
   * Resolve a phone number or email to a contact name
   */
  async resolveContact(identifier: string): Promise<ContactInfo> {
    // Check cache first
    if (this.contactCache.has(identifier)) {
      return this.contactCache.get(identifier)!;
    }

    // Check manual mappings
    if (this.manualContacts.has(identifier)) {
      const contactInfo: ContactInfo = {
        displayName: this.manualContacts.get(identifier)!,
        phoneNumber: identifier.includes('@') ? undefined : identifier,
        email: identifier.includes('@') ? identifier : undefined,
      };
      this.contactCache.set(identifier, contactInfo);
      return contactInfo;
    }

    // Try to resolve via macOS Contacts app
    try {
      const contactInfo = await this.resolveViaContacts(identifier);
      if (contactInfo) {
        this.contactCache.set(identifier, contactInfo);
        return contactInfo;
      }
    } catch (error) {
      // Fallback to formatted identifier
    }

    // Fallback: return formatted identifier
    const fallbackInfo: ContactInfo = {
      displayName: this.formatIdentifier(identifier),
      phoneNumber: identifier.includes('@') ? undefined : identifier,
      email: identifier.includes('@') ? identifier : undefined,
    };
    
    this.contactCache.set(identifier, fallbackInfo);
    return fallbackInfo;
  }

  /**
   * Add manual contact mapping
   */
  addManualContact(identifier: string, displayName: string): void {
    this.manualContacts.set(identifier, displayName);
    this.saveManualContacts();
    
    // Update cache
    const existing = this.contactCache.get(identifier);
    if (existing) {
      existing.displayName = displayName;
    }
  }

  /**
   * Remove manual contact mapping
   */
  removeManualContact(identifier: string): void {
    this.manualContacts.delete(identifier);
    this.saveManualContacts();
    
    // Clear from cache to force re-resolution
    this.contactCache.delete(identifier);
  }

  /**
   * Get all manual contact mappings
   */
  getManualContacts(): Map<string, string> {
    return new Map(this.manualContacts);
  }

  /**
   * Try to resolve contact via macOS Contacts app using AppleScript
   */
  private async resolveViaContacts(identifier: string): Promise<ContactInfo | null> {
    return new Promise((resolve) => {
      // AppleScript to query Contacts app
      const script = identifier.includes('@') 
        ? `
          tell application "Contacts"
            set matchingPeople to (every person whose email contains "${identifier}")
            if length of matchingPeople > 0 then
              set firstPerson to item 1 of matchingPeople
              set fullName to name of firstPerson
              return fullName
            else
              return ""
            end if
          end tell
        `
        : `
          tell application "Contacts"
            set phoneToFind to "${this.normalizePhoneForSearch(identifier)}"
            set matchingPeople to (every person whose phone contains phoneToFind)
            if length of matchingPeople > 0 then
              set firstPerson to item 1 of matchingPeople
              set fullName to name of firstPerson
              return fullName
            else
              return ""
            end if
          end tell
        `;

      const osascript = spawn('osascript', ['-e', script]);
      let output = '';
      let error = '';

      osascript.stdout.on('data', (data) => {
        output += data.toString();
      });

      osascript.stderr.on('data', (data) => {
        error += data.toString();
      });

      osascript.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const displayName = output.trim();
          resolve({
            displayName,
            phoneNumber: identifier.includes('@') ? undefined : identifier,
            email: identifier.includes('@') ? identifier : undefined,
          });
        } else {
          resolve(null);
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        osascript.kill();
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Format identifier for display when no contact found
   */
  private formatIdentifier(identifier: string): string {
    if (identifier.includes('@')) {
      return identifier; // Email addresses are already readable
    }
    
    // Format phone numbers with auto +1 country code
    return this.formatPhoneNumber(identifier);
  }

  /**
   * Normalize phone number for search in Contacts app
   */
  private normalizePhoneForSearch(identifier: string): string {
    const digits = identifier.replace(/\D/g, '');
    
    // For 10-digit numbers, search with just the digits (Contacts might have different formats)
    if (digits.length === 10) {
      return digits;
    }
    
    // For 11-digit numbers starting with 1, remove the leading 1
    if (digits.length === 11 && digits[0] === '1') {
      return digits.slice(1);
    }
    
    // For other cases, return the digits as-is
    return digits;
  }

  /**
   * Format phone number with auto +1 country code addition
   */
  private formatPhoneNumber(phone: string): string {
    // Remove non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Auto-add +1 for 10-digit numbers (assume US/Canada)
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } 
    // Format 11-digit numbers starting with 1
    else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    // For other lengths, try to format but preserve original structure
    else if (digits.length > 10) {
      // International number - add + if missing
      const formatted = phone.startsWith('+') ? phone : `+${phone}`;
      return formatted;
    }
    
    // Fallback for short numbers or non-standard formats
    return phone;
  }

  /**
   * Load manual contacts from config file
   */
  private loadManualContacts(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'contacts-config.json');
      
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        const contacts = JSON.parse(data);
        this.manualContacts = new Map(Object.entries(contacts));
      }
    } catch (error) {
      // Ignore errors, will start with empty manual contacts
    }
  }

  /**
   * Save manual contacts to config file
   */
  private saveManualContacts(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'contacts-config.json');
      
      const contactsObj = Object.fromEntries(this.manualContacts);
      fs.writeFileSync(configPath, JSON.stringify(contactsObj, null, 2));
    } catch (error) {
      console.error('Failed to save manual contacts:', error);
    }
  }

  /**
   * Batch resolve multiple contacts
   */
  async resolveMultipleContacts(identifiers: string[]): Promise<Map<string, ContactInfo>> {
    const results = new Map<string, ContactInfo>();
    
    // Process in parallel with a limit
    const batchSize = 5;
    for (let i = 0; i < identifiers.length; i += batchSize) {
      const batch = identifiers.slice(i, i + batchSize);
      const promises = batch.map(async (id) => {
        const contact = await this.resolveContact(id);
        return [id, contact] as [string, ContactInfo];
      });
      
      const batchResults = await Promise.all(promises);
      batchResults.forEach(([id, contact]) => {
        results.set(id, contact);
      });
    }
    
    return results;
  }
}
