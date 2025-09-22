import { ContactCache } from './ContactCache';

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
  private globalContactCache: ContactCache;

  constructor() {
    this.loadManualContacts();
    this.globalContactCache = new ContactCache();
  }

  /**
   * Initialize the global contact cache (call this once at startup)
   */
  async initialize(): Promise<void> {
    const cacheExists = await this.globalContactCache.cacheExists();
    
    if (!cacheExists) {
      console.log('📇 No contact cache found. Run "npm run cli contacts --sync" to download contacts for fast lookups.');
      console.log('📇 Contact resolution will fall back to manual mappings and formatted display names.');
    } else {
      const isValid = await this.globalContactCache.isCacheValid();
      if (isValid) {
        await this.globalContactCache.loadCache();
        const cacheInfo = this.globalContactCache.getCacheInfo();
        console.log(`📇 Loaded contacts cache: ${cacheInfo?.contacts} contacts, ${cacheInfo?.phones} phones, ${cacheInfo?.emails} emails`);
        const daysSinceUpdate = cacheInfo ? Math.floor((Date.now() - new Date(cacheInfo.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        console.log(`📇 Cache age: ${daysSinceUpdate} day(s) old`);
      } else {
        console.log('📇 Contact cache is stale (>30 days old). Run "npm run cli contacts --sync" to refresh.');
        await this.globalContactCache.loadCache(); // Load it anyway, better than nothing
      }
    }
  }

  /**
   * Resolve a phone number or email to a contact name (fast lookup)
   */
  async resolveContact(identifier: string): Promise<ContactInfo> {
    // Check local cache first
    if (this.contactCache.has(identifier)) {
      return this.contactCache.get(identifier)!;
    }

    let displayName: string | null = null;

    // Try global contact cache first (fastest)
    if (identifier.includes('@')) {
      displayName = this.globalContactCache.lookupByEmail(identifier);
    } else {
      displayName = this.globalContactCache.lookupByPhone(identifier);
    }

    // If found in global cache, use that name
    if (displayName) {
      const contactInfo: ContactInfo = {
        displayName,
        phoneNumber: identifier.includes('@') ? undefined : identifier,
        email: identifier.includes('@') ? identifier : undefined,
      };
      this.contactCache.set(identifier, contactInfo);
      return contactInfo;
    }

    // Check manual mappings as backup
    if (this.manualContacts.has(identifier)) {
      const manualName = this.manualContacts.get(identifier)!;
      const contactInfo: ContactInfo = {
        displayName: manualName,
        phoneNumber: identifier.includes('@') ? undefined : identifier,
        email: identifier.includes('@') ? identifier : undefined,
      };
      this.contactCache.set(identifier, contactInfo);
      return contactInfo;
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
   * Force refresh of global contacts cache
   */
  async refreshContactsCache(): Promise<void> {
    await this.globalContactCache.forceRefresh();
    // Clear local cache to force re-resolution with new data
    this.contactCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheInfo(): { contacts: number; phones: number; emails: number; lastUpdated: string } | null {
    return this.globalContactCache.getCacheInfo();
  }

  /**
   * Search contacts by name
   */
  searchContactsByName(searchTerm: string): { name: string; phones: string[]; emails: string[] }[] {
    return this.globalContactCache.searchContactsByName(searchTerm);
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
   * Batch resolve multiple contacts (fast)
   */
  async resolveMultipleContacts(identifiers: string[]): Promise<Map<string, ContactInfo>> {
    const results = new Map<string, ContactInfo>();
    
    // Process all at once since we're using fast cached lookups
    const promises = identifiers.map(async (id) => {
      const contact = await this.resolveContact(id);
      return [id, contact] as [string, ContactInfo];
    });
    
    const batchResults = await Promise.all(promises);
    batchResults.forEach(([id, contact]) => {
      results.set(id, contact);
    });
    
    return results;
  }
}