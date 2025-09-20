import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ContactResolver } from '../services/ContactResolver';

export const contactsCommand = new Command('contacts')
  .description('Manage contact name mappings')
  .option('-a, --add <identifier>', 'Add manual contact mapping (will prompt for name)')
  .option('-r, --remove <identifier>', 'Remove manual contact mapping')
  .option('-l, --list', 'List all manual contact mappings')
  .option('-t, --test <identifier>', 'Test contact resolution for an identifier')
  .action(async (options) => {
    try {
      const contactResolver = new ContactResolver();

      if (options.add) {
        const identifier = options.add;
        const { name } = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: `Enter contact name for ${identifier}:`,
            validate: (input) => {
              if (!input.trim()) return 'Please enter a contact name.';
              return true;
            },
          },
        ]);
        contactResolver.addManualContact(identifier, name.trim());
        console.log(chalk.green(`✅ Added contact: ${identifier} → ${name}`));
        return;
      }

      if (options.remove) {
        contactResolver.removeManualContact(options.remove);
        console.log(chalk.green(`✅ Removed contact mapping for: ${options.remove}`));
        return;
      }

      if (options.list) {
        await showContactMappings(contactResolver);
        return;
      }

      if (options.test) {
        await testContactResolution(contactResolver, options.test);
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
