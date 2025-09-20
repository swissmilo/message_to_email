import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ContactResolver } from '../services/ContactResolver';

/**
 * Normalize phone number input to add +1 country code if needed
 */
function normalizePhoneInput(input: string): string {
  // If it's an email, return as-is
  if (input.includes('@')) {
    return input;
  }
  
  // Remove all non-digits
  const digits = input.replace(/\D/g, '');
  
  // Auto-add +1 for 10-digit US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // If it's 11 digits starting with 1, add +
  if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  
  // If it already starts with +, keep as-is
  if (input.startsWith('+')) {
    return input;
  }
  
  // For other cases, add + if it's all digits
  if (/^\d+$/.test(input.trim())) {
    return `+${input.trim()}`;
  }
  
  // Return original if we can't normalize
  return input;
}

export const contactsCommand = new Command('contacts')
  .description('Manage contact name mappings')
  .option('-a, --add <identifier>', 'Add manual contact mapping (will prompt for name)')
  .option('-r, --remove <identifier>', 'Remove manual contact mapping')
  .option('-l, --list', 'List all manual contact mappings')
  .option('-t, --test <identifier>', 'Test contact resolution for an identifier')
  .option('-s, --sync', 'Download and cache all contacts from macOS Contacts app')
  .option('--cache-info', 'Show contact cache information')
  .action(async (options) => {
    try {
      const contactResolver = new ContactResolver();

      if (options.sync) {
        await syncContacts(contactResolver);
        return;
      }

      if (options.cacheInfo) {
        await showCacheInfo(contactResolver);
        return;
      }
      
      // Initialize contact cache for other operations (but don't auto-sync)
      await contactResolver.initialize();

      if (options.add) {
        const normalizedIdentifier = normalizePhoneInput(options.add);
        const { name } = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: `Enter contact name for ${normalizedIdentifier}:`,
            validate: (input) => {
              if (!input.trim()) return 'Please enter a contact name.';
              return true;
            },
          },
        ]);
        contactResolver.addManualContact(normalizedIdentifier, name.trim());
        console.log(chalk.green(`✅ Added contact: ${normalizedIdentifier} → ${name}`));
        return;
      }

      if (options.remove) {
        const normalizedIdentifier = normalizePhoneInput(options.remove);
        contactResolver.removeManualContact(normalizedIdentifier);
        console.log(chalk.green(`✅ Removed contact mapping for: ${normalizedIdentifier}`));
        return;
      }

      if (options.list) {
        await showContactMappings(contactResolver);
        return;
      }

      if (options.test) {
        const normalizedIdentifier = normalizePhoneInput(options.test);
        await testContactResolution(contactResolver, normalizedIdentifier);
        return;
      }

      // Interactive mode
      await runContactsInteractive(contactResolver);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function runContactsInteractive(contactResolver: ContactResolver) {
  console.log(chalk.cyan('📇 Contact Management'));
  
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📋 View contact mappings', value: 'list' },
          { name: '➕ Add contact mapping', value: 'add' },
          { name: '➖ Remove contact mapping', value: 'remove' },
          { name: '🔍 Test contact resolution', value: 'test' },
          { name: '🔄 Bulk resolve from recent conversations', value: 'bulk' },
          { name: '🚪 Back to main menu', value: 'exit' },
        ],
      },
    ]);

    switch (action) {
      case 'list':
        await showContactMappings(contactResolver);
        break;
      case 'add':
        await addContactMapping(contactResolver);
        break;
      case 'remove':
        await removeContactMapping(contactResolver);
        break;
      case 'test':
        await testContactResolutionInteractive(contactResolver);
        break;
      case 'bulk':
        await bulkResolveContacts(contactResolver);
        break;
      case 'exit':
        return;
    }
    
    console.log(); // Add spacing
  }
}

async function showContactMappings(contactResolver: ContactResolver) {
  const mappings = contactResolver.getManualContacts();
  
  if (mappings.size === 0) {
    console.log(chalk.yellow('📭 No manual contact mappings configured.'));
    console.log(chalk.gray('   Use "Add contact mapping" to create some.'));
    return;
  }

  console.log(chalk.bold.cyan('\n📇 Manual Contact Mappings:'));
  console.log();

  let index = 1;
  for (const [identifier, name] of mappings) {
    console.log(`${chalk.cyan(index.toString().padStart(2, ' '))}. ${chalk.bold(name)}`);
    console.log(`    ${chalk.gray(identifier)}`);
    index++;
  }
}

async function addContactMapping(contactResolver: ContactResolver) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'identifier',
      message: 'Enter phone number or email:',
      validate: (input) => {
        if (!input.trim()) return 'Please enter a phone number or email.';
        return true;
      },
      filter: (input) => {
        // Auto-normalize phone numbers
        return normalizePhoneInput(input.trim());
      },
    },
    {
      type: 'input',
      name: 'name',
      message: 'Enter contact name:',
      validate: (input) => {
        if (!input.trim()) return 'Please enter a contact name.';
        return true;
      },
    },
  ]);

  contactResolver.addManualContact(answers.identifier.trim(), answers.name.trim());
  console.log(chalk.green(`✅ Added contact: ${answers.identifier} → ${answers.name}`));
}

async function removeContactMapping(contactResolver: ContactResolver) {
  const mappings = contactResolver.getManualContacts();
  
  if (mappings.size === 0) {
    console.log(chalk.yellow('📭 No contact mappings to remove.'));
    return;
  }

  const choices = Array.from(mappings.entries()).map(([identifier, name]) => ({
    name: `${name} (${identifier})`,
    value: identifier,
  }));

  const { identifier } = await inquirer.prompt([
    {
      type: 'list',
      name: 'identifier',
      message: 'Select contact to remove:',
      choices,
    },
  ]);

  contactResolver.removeManualContact(identifier);
  console.log(chalk.green(`✅ Removed contact mapping for: ${identifier}`));
}

async function testContactResolutionInteractive(contactResolver: ContactResolver) {
  const { identifier } = await inquirer.prompt([
    {
      type: 'input',
      name: 'identifier',
      message: 'Enter phone number or email to test:',
      validate: (input) => {
        if (!input.trim()) return 'Please enter a phone number or email.';
        return true;
      },
    },
  ]);

  await testContactResolution(contactResolver, identifier.trim());
}

async function testContactResolution(contactResolver: ContactResolver, identifier: string) {
  console.log(chalk.cyan(`🔍 Testing contact resolution for: ${identifier}`));
  console.log();
  
  try {
    const startTime = Date.now();
    const contactInfo = await contactResolver.resolveContact(identifier);
    const duration = Date.now() - startTime;
    
    console.log(chalk.green('✅ Contact resolved successfully:'));
    console.log(`   Name: ${chalk.bold(contactInfo.displayName)}`);
    if (contactInfo.firstName) console.log(`   First Name: ${contactInfo.firstName}`);
    if (contactInfo.lastName) console.log(`   Last Name: ${contactInfo.lastName}`);
    if (contactInfo.company) console.log(`   Company: ${contactInfo.company}`);
    if (contactInfo.phoneNumber) console.log(`   Phone: ${contactInfo.phoneNumber}`);
    if (contactInfo.email) console.log(`   Email: ${contactInfo.email}`);
    console.log(chalk.gray(`   Resolution time: ${duration}ms`));
    
  } catch (error) {
    console.log(chalk.red('❌ Contact resolution failed:'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

async function bulkResolveContacts(contactResolver: ContactResolver) {
  console.log(chalk.cyan('🔄 Bulk resolving contacts from recent conversations...'));
  
  // This would integrate with MessageExporter to get recent participants
  // For now, let's show how it would work
  const { MessageExporter } = await import('../services/MessageExporter');
  const exporter = new MessageExporter();
  
  try {
    const conversations = await exporter.listConversations();
    const allParticipants = new Set<string>();
    
    conversations.forEach(conv => {
      conv.participants.forEach(p => allParticipants.add(p));
    });
    
    if (allParticipants.size === 0) {
      console.log(chalk.yellow('📭 No participants found in recent conversations.'));
      return;
    }
    
    console.log(chalk.gray(`Found ${allParticipants.size} unique participants. Resolving...`));
    
    const participantArray = Array.from(allParticipants);
    const resolved = await contactResolver.resolveMultipleContacts(participantArray);
    
    console.log(chalk.bold.cyan('\n📇 Resolved Contacts:'));
    console.log();
    
    let foundContacts = 0;
    for (const [identifier, contactInfo] of resolved) {
      if (contactInfo.displayName !== identifier && 
          !contactInfo.displayName.match(/^\+?\d/) && 
          !contactInfo.displayName.includes('@')) {
        foundContacts++;
        console.log(`${chalk.green('✓')} ${chalk.bold(contactInfo.displayName)} (${identifier})`);
      } else {
        console.log(`${chalk.gray('○')} ${contactInfo.displayName}`);
      }
    }
    
    console.log();
    console.log(chalk.green(`✅ Found ${foundContacts} contacts with resolved names.`));
    
    if (foundContacts === 0) {
      console.log(chalk.yellow('💡 Tip: Add manual contact mappings for better display names.'));
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Bulk resolution failed:'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Sync contacts from macOS Contacts app
 */
async function syncContacts(contactResolver: ContactResolver) {
  console.log(chalk.cyan('📇 Syncing contacts from macOS Contacts app...'));
  console.log(chalk.gray('This may take a few minutes for large contact lists.\n'));

  try {
    await contactResolver.refreshContactsCache();
    
    const cacheInfo = contactResolver.getCacheInfo();
    if (cacheInfo) {
      console.log(chalk.green('✅ Contact sync completed successfully!'));
      console.log(`   📞 ${cacheInfo.contacts} contacts cached`);
      console.log(`   📞 ${cacheInfo.phones} phone numbers indexed`);
      console.log(`   📧 ${cacheInfo.emails} email addresses indexed`);
      console.log(`   🕒 Last updated: ${new Date(cacheInfo.lastUpdated).toLocaleString()}`);
      console.log();
      console.log(chalk.cyan('💡 Contact lookups will now be much faster!'));
    } else {
      console.log(chalk.yellow('⚠️  Sync completed but cache info unavailable'));
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to sync contacts:'), error instanceof Error ? error.message : String(error));
    console.log();
    console.log(chalk.gray('You can still use manual contact mappings with:'));
    console.log(chalk.gray('npm run cli -- contacts --add <phone-number>'));
  }
}

/**
 * Show contact cache information
 */
async function showCacheInfo(contactResolver: ContactResolver) {
  console.log(chalk.cyan('📇 Contact Cache Information\n'));

  try {
    await contactResolver.initialize();
    const cacheInfo = contactResolver.getCacheInfo();

    if (cacheInfo) {
      const lastUpdated = new Date(cacheInfo.lastUpdated);
      const daysSinceUpdate = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`📞 Contacts cached: ${chalk.bold(cacheInfo.contacts.toLocaleString())}`);
      console.log(`📞 Phone numbers indexed: ${chalk.bold(cacheInfo.phones.toLocaleString())}`);
      console.log(`📧 Email addresses indexed: ${chalk.bold(cacheInfo.emails.toLocaleString())}`);
      console.log(`🕒 Last updated: ${chalk.bold(lastUpdated.toLocaleString())}`);
      console.log(`📅 Cache age: ${chalk.bold(daysSinceUpdate)} day(s) old`);
      
      if (daysSinceUpdate > 30) {
        console.log();
        console.log(chalk.yellow('⚠️  Cache is stale (>30 days old). Consider refreshing:'));
        console.log(chalk.gray('npm run cli -- contacts --sync'));
      } else if (daysSinceUpdate > 7) {
        console.log();
        console.log(chalk.gray('💡 Cache is getting old. You may want to refresh soon:'));
        console.log(chalk.gray('npm run cli -- contacts --sync'));
      } else {
        console.log();
        console.log(chalk.green('✅ Cache is fresh and up to date!'));
      }
    } else {
      console.log(chalk.yellow('⚠️  No contact cache found.'));
      console.log();
      console.log(chalk.gray('To enable fast contact lookups, run:'));
      console.log(chalk.gray('npm run cli -- contacts --sync'));
    }

    // Show manual contacts count
    const manualContacts = contactResolver.getManualContacts();
    if (manualContacts.size > 0) {
      console.log();
      console.log(`🔧 Manual contact mappings: ${chalk.bold(manualContacts.size.toString())}`);
      console.log(chalk.gray('Use --list to see all manual mappings'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to get cache info:'), error instanceof Error ? error.message : String(error));
  }
}
