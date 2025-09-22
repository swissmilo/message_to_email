import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

export const installCommand = new Command('install')
  .description('Install iMessage Sync as a system service')
  .option('--uninstall', 'Uninstall the system service')
  .option('--status', 'Show service status')
  .option('--start', 'Start the service')
  .option('--stop', 'Stop the service')
  .option('--restart', 'Restart the service')
  .option('--logs', 'Show service logs')
  .action(async (options) => {
    try {
      if (options.uninstall) {
        await uninstallService();
      } else if (options.status) {
        await showServiceStatus();
      } else if (options.start) {
        await startService();
      } else if (options.stop) {
        await stopService();
      } else if (options.restart) {
        await restartService();
      } else if (options.logs) {
        await showLogs();
      } else {
        // Interactive installation
        await installServiceInteractive();
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Interactive service installation
 */
async function installServiceInteractive() {
  console.log(chalk.cyan('🚀 iMessage Sync Service Installation\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '📦 Install service (auto-start on boot)', value: 'install' },
        { name: '🗑️  Uninstall service', value: 'uninstall' },
        { name: '📊 Show service status', value: 'status' },
        { name: '▶️  Start service', value: 'start' },
        { name: '⏹️  Stop service', value: 'stop' },
        { name: '🔄 Restart service', value: 'restart' },
        { name: '📜 View logs', value: 'logs' },
        { name: '🔙 Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') return;

  switch (action) {
    case 'install':
      await installService();
      break;
    case 'uninstall':
      await uninstallService();
      break;
    case 'status':
      await showServiceStatus();
      break;
    case 'start':
      await startService();
      break;
    case 'stop':
      await stopService();
      break;
    case 'restart':
      await restartService();
      break;
    case 'logs':
      await showLogs();
      break;
  }
}

/**
 * Install the service
 */
async function installService() {
  console.log(chalk.cyan('📦 Installing iMessage Sync service...\n'));

  try {
    // Check if service is already installed
    const isInstalled = await checkServiceInstalled();
    if (isInstalled) {
      console.log(chalk.yellow('⚠️  Service is already installed.'));
      const { shouldReinstall } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldReinstall',
          message: 'Would you like to reinstall it?',
          default: false,
        },
      ]);

      if (!shouldReinstall) {
        console.log(chalk.gray('Installation cancelled.'));
        return;
      }

      await uninstallService(true); // Silent uninstall
    }

    // Find Node.js path
    const nodePath = await findNodePath();
    console.log(chalk.gray(`• Node.js found at: ${nodePath}`));

    // Get current directory
    const appDirectory = process.cwd();
    const userHome = homedir();

    console.log(chalk.gray(`• App directory: ${appDirectory}`));

    // Read template plist
    const templatePath = path.join(appDirectory, 'scripts', 'com.imessage-sync.plist');
    let plistContent = await fs.readFile(templatePath, 'utf-8');

    // Replace placeholders
    plistContent = plistContent
      .replace(/\/usr\/local\/bin\/node/g, nodePath)
      .replace(/APP_DIRECTORY/g, appDirectory)
      .replace(/USER_HOME/g, userHome);

    // Write to LaunchAgents directory
    const launchAgentsDir = path.join(userHome, 'Library', 'LaunchAgents');
    await fs.mkdir(launchAgentsDir, { recursive: true });
    
    const plistPath = path.join(launchAgentsDir, 'com.imessage-sync.plist');
    await fs.writeFile(plistPath, plistContent);

    console.log(chalk.green('✅ Service plist installed'));

    // Load the service
    await execCommand('launchctl', ['load', plistPath]);
    console.log(chalk.green('✅ Service loaded'));

    // Start the service
    await execCommand('launchctl', ['start', 'com.imessage-sync']);
    console.log(chalk.green('✅ Service started'));

    console.log(chalk.cyan('\n🎉 Installation completed successfully!'));
    console.log(chalk.gray('\nService management commands:'));
    console.log(chalk.gray('• npm run cli -- install --status    # Check status'));
    console.log(chalk.gray('• npm run cli -- install --start     # Start service'));
    console.log(chalk.gray('• npm run cli -- install --stop      # Stop service'));
    console.log(chalk.gray('• npm run cli -- install --logs      # View logs'));
    console.log(chalk.gray('• npm run cli -- install --uninstall # Remove service'));

    // Show initial status
    setTimeout(async () => {
      console.log(chalk.cyan('\n📊 Current Status:'));
      await showServiceStatus();
    }, 1000);

  } catch (error) {
    console.error(chalk.red('❌ Installation failed:'), error);
    throw error;
  }
}

/**
 * Uninstall the service
 */
async function uninstallService(silent = false) {
  if (!silent) {
    console.log(chalk.cyan('🗑️  Uninstalling iMessage Sync service...\n'));
  }

  try {
    const userHome = homedir();
    const plistPath = path.join(userHome, 'Library', 'LaunchAgents', 'com.imessage-sync.plist');

    // Check if service exists
    const exists = await fs.access(plistPath).then(() => true).catch(() => false);
    if (!exists) {
      if (!silent) {
        console.log(chalk.yellow('⚠️  Service is not installed.'));
      }
      return;
    }

    // Stop and unload the service
    try {
      await execCommand('launchctl', ['stop', 'com.imessage-sync']);
      if (!silent) console.log(chalk.green('✅ Service stopped'));
    } catch (error) {
      // Service might not be running, that's okay
    }

    try {
      await execCommand('launchctl', ['unload', plistPath]);
      if (!silent) console.log(chalk.green('✅ Service unloaded'));
    } catch (error) {
      // Service might not be loaded, that's okay
    }

    // Remove the plist file
    await fs.unlink(plistPath);
    if (!silent) console.log(chalk.green('✅ Service plist removed'));

    if (!silent) {
      console.log(chalk.cyan('\n🎉 Uninstallation completed successfully!'));
    }

  } catch (error) {
    console.error(chalk.red('❌ Uninstallation failed:'), error);
    throw error;
  }
}

/**
 * Show service status
 */
async function showServiceStatus() {
  console.log(chalk.cyan('📊 Service Status\n'));

  try {
    // Check if service is installed
    const isInstalled = await checkServiceInstalled();
    console.log(`Installed: ${isInstalled ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);

    if (!isInstalled) {
      console.log(chalk.gray('\nRun "npm run cli -- install" to install the service.'));
      return;
    }

    // Check if service is loaded
    const isLoaded = await checkServiceLoaded();
    console.log(`Loaded: ${isLoaded ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);

    // Check if service is running
    const isRunning = await checkServiceRunning();
    console.log(`Running: ${isRunning ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);

    // Show log file locations
    const userHome = homedir();
    console.log(chalk.gray('\nLog files:'));
    console.log(chalk.gray(`• Output: ${userHome}/Library/Logs/imessage-sync.log`));
    console.log(chalk.gray(`• Errors: ${userHome}/Library/Logs/imessage-sync-error.log`));

    // Show recent log entries if running
    if (isRunning) {
      console.log(chalk.cyan('\n📜 Recent logs (last 5 lines):'));
      try {
        const logPath = path.join(userHome, 'Library', 'Logs', 'imessage-sync.log');
        const logs = await execCommand('tail', ['-n', '5', logPath]);
        console.log(chalk.gray(logs));
      } catch (error) {
        console.log(chalk.gray('No logs available yet.'));
      }
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to get status:'), error);
  }
}

/**
 * Start the service
 */
async function startService() {
  console.log(chalk.cyan('▶️  Starting service...'));

  try {
    await execCommand('launchctl', ['start', 'com.imessage-sync']);
    console.log(chalk.green('✅ Service started successfully'));
    
    setTimeout(async () => {
      await showServiceStatus();
    }, 1000);
  } catch (error) {
    console.error(chalk.red('❌ Failed to start service:'), error);
  }
}

/**
 * Stop the service
 */
async function stopService() {
  console.log(chalk.cyan('⏹️  Stopping service...'));

  try {
    await execCommand('launchctl', ['stop', 'com.imessage-sync']);
    console.log(chalk.green('✅ Service stopped successfully'));
  } catch (error) {
    console.error(chalk.red('❌ Failed to stop service:'), error);
  }
}

/**
 * Restart the service
 */
async function restartService() {
  console.log(chalk.cyan('🔄 Restarting service...'));

  try {
    await stopService();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a second
    await startService();
  } catch (error) {
    console.error(chalk.red('❌ Failed to restart service:'), error);
  }
}

/**
 * Show logs
 */
async function showLogs() {
  const userHome = homedir();
  const logPath = path.join(userHome, 'Library', 'Logs', 'imessage-sync.log');
  const errorLogPath = path.join(userHome, 'Library', 'Logs', 'imessage-sync-error.log');

  console.log(chalk.cyan('📜 Service Logs\n'));

  try {
    console.log(chalk.bold('Output Log (last 20 lines):'));
    const logs = await execCommand('tail', ['-n', '20', logPath]);
    console.log(chalk.gray(logs));

    console.log(chalk.bold('\nError Log (last 10 lines):'));
    const errorLogs = await execCommand('tail', ['-n', '10', errorLogPath]);
    console.log(chalk.red(errorLogs));

    console.log(chalk.gray(`\nTo follow logs in real-time:`));
    console.log(chalk.gray(`tail -f ${logPath}`));
    console.log(chalk.gray(`tail -f ${errorLogPath}`));

  } catch (error) {
    console.log(chalk.yellow('⚠️  Log files not found or not accessible.'));
    console.log(chalk.gray('The service may not be running or haven\'t generated logs yet.'));
  }
}

/**
 * Check if service is installed
 */
async function checkServiceInstalled(): Promise<boolean> {
  const userHome = homedir();
  const plistPath = path.join(userHome, 'Library', 'LaunchAgents', 'com.imessage-sync.plist');
  return fs.access(plistPath).then(() => true).catch(() => false);
}

/**
 * Check if service is loaded
 */
async function checkServiceLoaded(): Promise<boolean> {
  try {
    const output = await execCommand('launchctl', ['list']);
    return output.includes('com.imessage-sync');
  } catch (error) {
    return false;
  }
}

/**
 * Check if service is running
 */
async function checkServiceRunning(): Promise<boolean> {
  try {
    const output = await execCommand('launchctl', ['list', 'com.imessage-sync']);
    return output.includes('"PID"');
  } catch (error) {
    return false;
  }
}

/**
 * Find Node.js executable path
 */
async function findNodePath(): Promise<string> {
  const possiblePaths = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/bin/node',
  ];

  for (const nodePath of possiblePaths) {
    try {
      await fs.access(nodePath);
      return nodePath;
    } catch (error) {
      // Continue to next path
    }
  }

  // Try using 'which node'
  try {
    const output = await execCommand('which', ['node']);
    return output.trim();
  } catch (error) {
    throw new Error('Node.js not found. Please install Node.js or ensure it\'s in your PATH.');
  }
}

/**
 * Execute a command and return output
 */
function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: 'pipe' });
    let output = '';
    let error = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      error += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(error || `Command failed with code ${code}`));
      }
    });
  });
}
