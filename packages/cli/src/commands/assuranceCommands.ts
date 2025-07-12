/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

async function createDirectoryStructure(basePath: string) {
  const dirs = ['evidence', 'patterns', 'report', 'workpapers'];
  for (const dir of dirs) {
    await fs.mkdir(path.join(basePath, dir), { recursive: true });
    // Create .gitkeep file to ensure directory is tracked in git
    await fs.writeFile(path.join(basePath, dir, '.gitkeep'), '');
  }
}

async function createEngagementFile(basePath: string, engagementName: string) {
  const engagementData = {
    name: engagementName,
    createdAt: new Date().toISOString(),
    schemaVersion: '1.0',
  };
  const yamlData = `name: ${engagementData.name}\ncreatedAt: ${engagementData.createdAt}\nschemaVersion: ${engagementData.schemaVersion}\n`;
  await fs.writeFile(path.join(basePath, 'engagement.yaml'), yamlData);
}

export async function assuranceNew(engagementName: string) {
  if (!engagementName) {
    return 'Error: Engagement name is required.';
  }

  const dirName = slugify(engagementName);
  const engagementPath = path.join(process.cwd(), dirName);

  try {
    await fs.mkdir(engagementPath, { recursive: true });
    await createDirectoryStructure(engagementPath);
    await createEngagementFile(engagementPath, engagementName);
    return `✅ Success! New engagement scaffolded at:\n${engagementPath}`;
  } catch (error) {
    return `❌ Error creating engagement: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function assuranceAdd() {
  return "Success! The 'assurance add' command is coming soon and will be used to add patterns and modules.";
}

export async function handleAssuranceCommand(options: {
  action: string;
  args: string[];
}) {
  const { action, args } = options;

  const program = new Command();

  program
    .name('assurance')
    .description(
      'A suite of tools for working with the Integrated Assurance framework.',
    );

  program
    .command('new <engagement_name>')
    .description('Scaffold a new assurance engagement.')
    .action(async (engagementName) => {
      const result = await assuranceNew(engagementName);
      console.log(result);
    });

  program
    .command('add')
    .description('Add a pattern or module to an existing engagement.')
    .action(() => {
      console.log(assuranceAdd());
    });

  // Prevent commander from exiting the process during tests
  program.exitOverride();

  try {
    // Prepend 'assurance' to the args array so that commander knows how to parse it.
    program.parse(['assurance', action, ...args]);
  } catch (_e) {
    // Ignore errors in test environment
  }
}

export class AssuranceCommandHandler {
  async handleCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log('Missing command\nUsage: /assurance <new|list|report> [options]');
      return;
    }

    const action = args[0];
    const additionalArgs = args.slice(1);

    await handleAssuranceCommand({
      action,
      args: additionalArgs,
    });
  }
}
