#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { listCommand } from './commands/list';

const program = new Command();

// ASCII art banner
const banner = `
╭─────────────────────────────────────╮
│                                     │
│    iMessage to Email Sync CLI       │
│    Version 1.0.0                    │
│                                     │
╰─────────────────────────────────────╯
`;

program
  .name('imessage-sync')
  .description('CLI tool to sync iMessage conversations to email')
  .version('1.0.0')
  .addHelpText('before', chalk.cyan(banner));

// Add commands
program.addCommand(listCommand);

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
