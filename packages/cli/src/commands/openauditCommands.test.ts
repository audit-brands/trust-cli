/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { openauditNew, openauditAdd } from './openauditCommands.js';

describe('openauditCommands', () => {
  it('should return a message for the new command', async () => {
    const message = await openauditNew('Test Engagement');
    expect(message).toContain('Success! New engagement scaffolded at:');
  });

  it('should return an error if no engagement name is provided', async () => {
    const result = await openauditNew('');
    expect(result).toContain('Error: Engagement name is required.');
  });

  it('should return a message for the add command', () => {
    const message = openauditAdd();
    expect(message).toContain(
      "Success! The 'openaudit add' command is coming soon",
    );
  });
});
