import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import chalk from 'chalk';

/**
 * Check if the application has Full Disk Access permission
 */
export async function checkFullDiskAccess(): Promise<boolean> {
  try {
    // Try to access the Messages database location
    const messagesDbPath = path.join(
      os.homedir(),
      'Library',
      'Messages',
      'chat.db'
    );
    
    await fs.access(messagesDbPath, fs.constants.R_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Display instructions for granting Full Disk Access
 */
export function displayPermissionInstructions(): void {
  console.log('\n' + chalk.yellow('⚠️  Full Disk Access Required'));
  console.log(chalk.white('\nThis app needs Full Disk Access to read your Messages database.'));
  console.log(chalk.white('\nTo grant permission:'));
  console.log(chalk.cyan('1. Open System Settings'));
  console.log(chalk.cyan('2. Go to Privacy & Security → Full Disk Access'));
  console.log(chalk.cyan('3. Click the + button'));
  console.log(chalk.cyan('4. Add your terminal application (Terminal.app or iTerm)'));
  console.log(chalk.cyan('5. Restart your terminal'));
  console.log(chalk.white('\nAfter granting permission, run this command again.\n'));
}

/**
 * Check if imessage-exporter is installed
 */
export async function checkImessageExporterInstalled(): Promise<boolean> {
  try {
    const { MessageExporter } = await import('../services/MessageExporter');
    const exporter = new MessageExporter();
    return await exporter.checkInstallation();
  } catch (error) {
    return false;
  }
}

/**
 * Display installation instructions for imessage-exporter
 */
export function displayInstallationInstructions(): void {
  console.log('\n' + chalk.yellow('⚠️  imessage-exporter Not Found'));
  console.log(chalk.white('\nPlease install imessage-exporter first:'));
  console.log(chalk.cyan('\nUsing Homebrew:'));
  console.log(chalk.green('  brew install imessage-exporter'));
  console.log(chalk.cyan('\nUsing Cargo (Rust):'));
  console.log(chalk.green('  cargo install imessage-exporter'));
  console.log(chalk.white('\nFor more information, visit:'));
  console.log(chalk.blue('  https://github.com/ReagentX/imessage-exporter\n'));
}
