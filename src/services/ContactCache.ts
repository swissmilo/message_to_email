import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CachedContact {
  name: string;
  phones: string[];
  emails: string[];
}

export interface ContactCacheData {
  contacts: CachedContact[];
  lastUpdated: string;
  phoneIndex: Map<string, string>; // normalized phone -> name
  emailIndex: Map<string, string>; // email -> name
}

export class ContactCache {
  private cacheFile: string;
  private cache: ContactCacheData | null = null;

  constructor() {
    this.cacheFile = path.join(process.cwd(), 'contacts-cache.json');
  }

  /**
   * Download all contacts from macOS Contacts app and build cache
   */
  async syncContacts(): Promise<void> {
    console.log('📇 Syncing contacts from macOS Contacts app...');
    const startTime = Date.now();

    try {
      const contacts = await this.downloadAllContacts();
      const cache: ContactCacheData = {
        contacts,
        lastUpdated: new Date().toISOString(),
        phoneIndex: new Map(),
        emailIndex: new Map(),
      };

      // Build lookup indexes
      for (const contact of contacts) {
        // Index all phone numbers
        for (const phone of contact.phones) {
          const normalizedPhone = this.normalizePhoneNumber(phone);
          if (normalizedPhone) {
            cache.phoneIndex.set(normalizedPhone, contact.name);
          }
        }

        // Index all emails
        for (const email of contact.emails) {
          cache.emailIndex.set(email.toLowerCase(), contact.name);
        }
      }

      this.cache = cache;
      await this.saveCache();

      const duration = Date.now() - startTime;
      console.log(`✅ Synced ${contacts.length} contacts in ${duration}ms`);
      console.log(`   📞 ${cache.phoneIndex.size} phone numbers indexed`);
      console.log(`   📧 ${cache.emailIndex.size} email addresses indexed`);
    } catch (error) {
      console.error('❌ Failed to sync contacts:', error);
      throw error;
    }
  }

  /**
   * Load contacts from cache file
   */
  async loadCache(): Promise<void> {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(data);
      
      // Convert plain objects back to Maps
      this.cache = {
        ...parsed,
        phoneIndex: new Map(Object.entries(parsed.phoneIndex || {})),
        emailIndex: new Map(Object.entries(parsed.emailIndex || {})),
      };
    } catch (error) {
      // Cache file doesn't exist or is invalid
      this.cache = null;
    }
  }

  /**
   * Save cache to file
   */
  private async saveCache(): Promise<void> {
    if (!this.cache) return;

    // Convert Maps to plain objects for JSON serialization
    const serializable = {
      ...this.cache,
      phoneIndex: Object.fromEntries(this.cache.phoneIndex),
      emailIndex: Object.fromEntries(this.cache.emailIndex),
    };

    await fs.writeFile(this.cacheFile, JSON.stringify(serializable, null, 2));
  }

  /**
   * Check if cache exists and is recent (less than 30 days old)
   */
  async isCacheValid(): Promise<boolean> {
    if (!this.cache) {
      await this.loadCache();
    }

    if (!this.cache) return false;

    const lastUpdated = new Date(this.cache.lastUpdated);
    const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceUpdate < 30; // Cache valid for 30 days
  }

  /**
   * Check if cache file exists at all
   */
  async cacheExists(): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(this.cacheFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Look up contact name by phone number (fast)
   */
  lookupByPhone(phoneNumber: string): string | null {
    if (!this.cache) return null;

    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (!normalized) return null;

    return this.cache.phoneIndex.get(normalized) || null;
  }

  /**
   * Look up contact name by email (fast)
   */
  lookupByEmail(email: string): string | null {
    if (!this.cache) return null;

    return this.cache.emailIndex.get(email.toLowerCase()) || null;
  }

  /**
   * Get cache statistics
   */
  getCacheInfo(): { contacts: number; phones: number; emails: number; lastUpdated: string } | null {
    if (!this.cache) return null;

    return {
      contacts: this.cache.contacts.length,
      phones: this.cache.phoneIndex.size,
      emails: this.cache.emailIndex.size,
      lastUpdated: this.cache.lastUpdated,
    };
  }

  /**
   * Download all contacts using AppleScript in batches
   */
  private async downloadAllContacts(): Promise<CachedContact[]> {
    console.log('📇 Getting contact count...');
    const totalContacts = await this.getContactCount();
    console.log(`📇 Found ${totalContacts} contacts, downloading in batches of 10...`);

    const allContacts: CachedContact[] = [];
    const batchSize = 10;
    
    for (let startIndex = 1; startIndex <= totalContacts; startIndex += batchSize) {
      const endIndex = Math.min(startIndex + batchSize - 1, totalContacts);
      console.log(`📇 Downloading contacts ${startIndex}-${endIndex}/${totalContacts}...`);
      
      try {
        const batchContacts = await this.downloadContactBatch(startIndex, endIndex);
        allContacts.push(...batchContacts);
      } catch (error) {
        console.warn(`⚠️  Failed to download batch ${startIndex}-${endIndex}: ${error}`);
        // Continue with other batches
      }
    }

    console.log(`📇 Successfully downloaded ${allContacts.length}/${totalContacts} contacts`);
    return allContacts;
  }

  /**
   * Get the total number of contacts
   */
  private async getContactCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      const script = `
        tell application "Contacts"
          return count of people
        end tell
      `;

      const osascript = spawn('osascript', ['-e', script]);
      let output = '';

      osascript.stdout.on('data', (data) => {
        output += data.toString();
      });

      osascript.on('close', (code) => {
        if (code === 0) {
          const count = parseInt(output.trim(), 10);
          resolve(isNaN(count) ? 0 : count);
        } else {
          reject(new Error('Failed to get contact count'));
        }
      });

      setTimeout(() => {
        osascript.kill();
        reject(new Error('Contact count query timed out'));
      }, 10000);
    });
  }

  /**
   * Download a batch of contacts by index range
   */
  private async downloadContactBatch(startIndex: number, endIndex: number): Promise<CachedContact[]> {
    return new Promise((resolve, reject) => {
      const script = `
        tell application "Contacts"
          repeat with i from ${startIndex} to ${endIndex}
            try
              set aPerson to person i
              set personName to name of aPerson
              set phoneNumbers to ""
              set emailAddresses to ""
              
              try
                set phoneList to phones of aPerson
                repeat with aPhone in phoneList
                  if phoneNumbers is "" then
                    set phoneNumbers to value of aPhone
                  else
                    set phoneNumbers to phoneNumbers & "~" & value of aPhone
                  end if
                end repeat
              end try
              
              try
                set emailList to emails of aPerson
                repeat with anEmail in emailList
                  if emailAddresses is "" then
                    set emailAddresses to value of anEmail
                  else
                    set emailAddresses to emailAddresses & "~" & value of anEmail
                  end if
                end repeat
              end try
              
              log personName & "|" & phoneNumbers & "|" & emailAddresses
            on error
              -- Skip contacts that cause errors
            end try
          end repeat
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
        if (code === 0) {
          try {
            const contacts = this.parseContactsOutput(error); // AppleScript 'log' outputs to stderr
            resolve(contacts);
          } catch (parseError) {
            reject(new Error(`Failed to parse contacts: ${parseError}`));
          }
        } else {
          reject(new Error(`AppleScript failed: ${error}`));
        }
      });

      // 15 second timeout per batch
      setTimeout(() => {
        osascript.kill();
        reject(new Error(`Contact batch ${startIndex}-${endIndex} timed out`));
      }, 15000);
    });
  }

  /**
   * Parse the AppleScript output into structured contact data
   */
  private parseContactsOutput(output: string): CachedContact[] {
    const contacts: CachedContact[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split('|');
      if (parts.length !== 3) continue;

      const name = parts[0].trim();
      const phonesPart = parts[1].trim();
      const emailsPart = parts[2].trim();

      const phones = phonesPart ? phonesPart.split('~').map(p => p.trim()).filter(p => p) : [];
      const emails = emailsPart ? emailsPart.split('~').map(e => e.trim()).filter(e => e) : [];

      if (name) {
        contacts.push({ name, phones, emails });
      }
    }

    return contacts;
  }

  /**
   * Normalize phone number to consistent format for indexing
   */
  private normalizePhoneNumber(phone: string): string | null {
    if (!phone) return null;

    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Skip very short numbers (probably not real phone numbers)
    if (digits.length < 7) return null;

    // Handle US/Canada numbers
    if (digits.length === 10) {
      // Add +1 for 10-digit US numbers
      return `+1${digits}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      // 11-digit number starting with 1
      return `+${digits}`;
    } else if (digits.length > 11) {
      // International number
      return phone.startsWith('+') ? phone.replace(/\D/g, '').replace(/^/, '+') : `+${digits}`;
    } else {
      // Other formats - try to preserve
      return phone.startsWith('+') ? phone.replace(/\D/g, '').replace(/^/, '+') : `+1${digits}`;
    }
  }

  /**
   * Force refresh of contacts cache
   */
  async forceRefresh(): Promise<void> {
    await this.syncContacts();
  }

  /**
   * Clear the contacts cache
   */
  async clearCache(): Promise<void> {
    this.cache = null;
    try {
      await fs.unlink(this.cacheFile);
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }

  /**
   * Search contacts by name (case-insensitive partial match)
   */
  searchContactsByName(searchTerm: string): { name: string; phones: string[]; emails: string[] }[] {
    if (!this.cache || !searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase().trim();
    const matches: { name: string; phones: string[]; emails: string[] }[] = [];

    for (const contact of this.cache.contacts) {
      if (contact.name.toLowerCase().includes(term)) {
        matches.push({
          name: contact.name,
          phones: contact.phones,
          emails: contact.emails,
        });
      }
    }

    // Sort by name for consistent results
    matches.sort((a, b) => a.name.localeCompare(b.name));
    
    // Limit to 20 results for performance
    return matches.slice(0, 20);
  }
}
