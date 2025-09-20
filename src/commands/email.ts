import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import dotenv from 'dotenv';
import { GmailService } from '../services/GmailService';
import { ConfigManager } from '../services/ConfigManager';

// Load environment variables
dotenv.config();

export const emailCommand = new Command('email')
  .description('Configure and test email settings')
  .option('-t, --test', 'Send a test email')
  .option('-c, --config', 'Configure email settings')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      if (options.test) {
        await testEmailSetup(config.email);
        return;
      }

      if (options.config) {
        await configureEmailSettings(configManager);
        return;
      }

      // Interactive mode
      await runEmailInteractive(configManager);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function runEmailInteractive(configManager: ConfigManager) {
  console.log(chalk.cyan('📧 Email Configuration'));
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '⚙️  Configure email settings', value: 'config' },
        { name: '📧 Send test email', value: 'test' },
        { name: '📋 Show current settings', value: 'status' },
        { name: '📖 Setup instructions', value: 'help' },
        { name: '🚪 Back to main menu', value: 'exit' },
      ],
    },
  ]);

  switch (action) {
    case 'config':
      await configureEmailSettings(configManager);
      break;
    case 'test':
      const config = await configManager.loadConfig();
      await testEmailSetup(config.email);
      break;
    case 'status':
      await showEmailStatus(configManager);
      break;
    case 'help':
      showSetupInstructions();
      break;
    case 'exit':
      return;
  }
}

async function configureEmailSettings(configManager: ConfigManager) {
  const config = await configManager.loadConfig();
  
  console.log(chalk.cyan('\n⚙️  Email Configuration'));
  console.log(chalk.gray('Current settings will be shown as defaults.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable email sending?',
      default: config.email.enabled,
    },
    {
      type: 'input',
      name: 'fromName',
      message: 'Sender name for emails:',
      default: config.email.fromName,
      when: (answers) => answers.enabled,
    },
    {
      type: 'input',
      name: 'recipientEmail',
      message: 'Recipient email (leave blank to use EMAIL_TO env var):',
      default: config.email.recipientEmail || '',
      when: (answers) => answers.enabled,
    },
  ]);

  // Update configuration
  const newConfig = {
    ...config,
    email: {
      enabled: answers.enabled,
      fromName: answers.fromName || config.email.fromName,
      recipientEmail: answers.recipientEmail || undefined,
    },
  };

  await configManager.saveConfig(newConfig);
  console.log(chalk.green('✅ Email settings saved!'));
}

async function testEmailSetup(emailConfig: any) {
  console.log(chalk.cyan('📧 Testing email setup...'));
  
  // Check environment variables
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log(chalk.red('❌ Missing Gmail credentials'));
    console.log(chalk.gray('Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.'));
    showSetupInstructions();
    return;
  }

  if (!emailConfig.enabled) {
    console.log(chalk.yellow('⚠️  Email sending is disabled in configuration.'));
    console.log(chalk.gray('Run "imessage-sync email --config" to enable it.'));
    return;
  }

  const recipientEmail = emailConfig.recipientEmail || process.env.EMAIL_TO;
  if (!recipientEmail) {
    console.log(chalk.red('❌ No recipient email configured'));
    console.log(chalk.gray('Set EMAIL_TO environment variable or configure in settings.'));
    return;
  }

  try {
    console.log(chalk.gray(`Sending test email to: ${recipientEmail}`));
    
    const gmailService = new GmailService(emailConfig);
    await gmailService.initialize();
    await gmailService.testEmailSending();
    
    console.log(chalk.green('✅ Test email sent successfully!'));
    console.log(chalk.gray(`Check your inbox at ${recipientEmail}`));
  } catch (error) {
    console.log(chalk.red('❌ Failed to send test email'));
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    
    if (error instanceof Error && error.message.includes('invalid login')) {
      console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
      console.log(chalk.gray('• Make sure you\'re using an App Password, not your regular Gmail password'));
      console.log(chalk.gray('• Verify your Gmail email and app password are correct'));
      console.log(chalk.gray('• Check that 2-factor authentication is enabled on your Google account'));
    }
  }
}

async function showEmailStatus(configManager: ConfigManager) {
  const config = await configManager.loadConfig();
  
  console.log(chalk.bold.cyan('\n📧 Email Status'));
  console.log();
  
  console.log(chalk.gray('Configuration:'));
  console.log(`  Enabled: ${config.email.enabled ? chalk.green('yes') : chalk.red('no')}`);
  console.log(`  From name: ${config.email.fromName}`);
  console.log(`  Recipient: ${config.email.recipientEmail || chalk.gray('(using EMAIL_TO env var)')}`);
  
  console.log();
  console.log(chalk.gray('Environment Variables:'));
  console.log(`  GMAIL_USER: ${process.env.GMAIL_USER ? chalk.green('set') : chalk.red('not set')}`);
  console.log(`  GMAIL_APP_PASSWORD: ${process.env.GMAIL_APP_PASSWORD ? chalk.green('set') : chalk.red('not set')}`);
  console.log(`  EMAIL_TO: ${process.env.EMAIL_TO ? chalk.green('set') : chalk.red('not set')}`);
  
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log();
    console.log(chalk.yellow('⚠️  Missing required environment variables.'));
    console.log(chalk.gray('See setup instructions below.'));
  }
}

function showSetupInstructions() {
  console.log(chalk.bold.cyan('\n📖 Gmail Setup Instructions'));
  console.log();
  
  console.log(chalk.bold('1. Enable 2-Factor Authentication'));
  console.log(chalk.gray('   Go to: https://myaccount.google.com/security'));
  console.log(chalk.gray('   Enable 2-Step Verification if not already enabled'));
  
  console.log();
  console.log(chalk.bold('2. Generate App Password'));
  console.log(chalk.gray('   Go to: https://myaccount.google.com/apppasswords'));
  console.log(chalk.gray('   Generate a new app password for "Mail"'));
  console.log(chalk.gray('   Copy the 16-character password (format: abcd efgh ijkl mnop)'));
  
  console.log();
  console.log(chalk.bold('3. Set Environment Variables'));
  console.log(chalk.gray('   Copy env.example to .env and fill in your details:'));
  console.log(chalk.cyan('   cp env.example .env'));
  console.log();
  console.log(chalk.gray('   Edit .env file:'));
  console.log(chalk.cyan('   GMAIL_USER=youremail@gmail.com'));
  console.log(chalk.cyan('   GMAIL_APP_PASSWORD=your-16-character-app-password'));
  console.log(chalk.cyan('   EMAIL_TO=recipient@gmail.com'));
  
  console.log();
  console.log(chalk.bold('4. Test Setup'));
  console.log(chalk.cyan('   imessage-sync email --test'));
  
  console.log();
  console.log(chalk.yellow('💡 Security Note:'));
  console.log(chalk.gray('   App passwords are safer than using your main Gmail password.'));
  console.log(chalk.gray('   You can revoke app passwords anytime from your Google account.'));
}
