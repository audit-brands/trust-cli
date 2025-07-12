/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand, SlashCommandSubCommand } from '../hooks/slashCommandProcessor.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

interface Help {
  commands: SlashCommand[];
}

interface HelpItem {
  key: string;
  description: string;
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).length <= maxWidth) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

function formatInColumns(items: HelpItem[], terminalWidth: number): React.ReactNode[] {
  const padding = 4; // Border and padding
  const availableWidth = terminalWidth - padding;
  
  // Determine if we can use two columns
  const maxKeyLength = Math.max(...items.map(item => item.key.length));
  const minDescLength = Math.min(...items.map(item => item.description.length));
  const twoColumnThreshold = 80; // Use two columns if terminal is wide enough
  
  const useColumns = availableWidth >= twoColumnThreshold && items.length >= 6;
  
  if (useColumns) {
    // Two-column layout
    const midpoint = Math.ceil(items.length / 2);
    const leftColumn = items.slice(0, midpoint);
    const rightColumn = items.slice(midpoint);
    const columnWidth = Math.floor(availableWidth / 2) - 2;
    
    const result: React.ReactNode[] = [];
    const maxRows = Math.max(leftColumn.length, rightColumn.length);
    
    for (let i = 0; i < maxRows; i++) {
      const leftItem = leftColumn[i];
      const rightItem = rightColumn[i];
      
      result.push(
        <Box key={`row-${i}`} flexDirection="row">
          <Box width={columnWidth} marginRight={1}>
            {leftItem && (
              <Text color={Colors.Foreground}>
                <Text bold color={Colors.AccentPurple}>
                  {leftItem.key}
                </Text>
                {' - ' + leftItem.description}
              </Text>
            )}
          </Box>
          <Box width={columnWidth}>
            {rightItem && (
              <Text color={Colors.Foreground}>
                <Text bold color={Colors.AccentPurple}>
                  {rightItem.key}
                </Text>
                {' - ' + rightItem.description}
              </Text>
            )}
          </Box>
        </Box>
      );
    }
    
    return result;
  } else {
    // Single-column layout with text wrapping
    return items.map((item) => {
      const fullText = `${item.key} - ${item.description}`;
      const lines = wrapText(fullText, availableWidth);
      
      return (
        <Box key={item.key} flexDirection="column">
          {lines.map((line, index) => (
            <Text key={index} color={Colors.Foreground}>
              {index === 0 ? (
                <>
                  <Text bold color={Colors.AccentPurple}>
                    {item.key}
                  </Text>
                  {' - ' + line.substring(item.key.length + 3)}
                </>
              ) : (
                '  ' + line
              )}
            </Text>
          ))}
        </Box>
      );
    });
  }
}

export const Help: React.FC<Help> = ({ commands }) => {
  const { columns: terminalWidth } = useTerminalSize();
  
  // Prepare commands data with subcommands
  const commandItems: HelpItem[] = [];
  
  // Add main commands
  commands
    .filter((command) => command.description)
    .forEach((command) => {
      commandItems.push({
        key: `/${command.name}`,
        description: command.description || '',
      });
      
      // Add subcommands with indentation - upstream commit 870797c1
      if (command.subCommands && command.subCommands.length > 0) {
        command.subCommands.forEach((subCommand) => {
          if (subCommand.description) {
            commandItems.push({
              key: `   ${subCommand.name}`,
              description: subCommand.description,
            });
          }
        });
      }
    });
  
  // Add shell command
  commandItems.push({ key: '!', description: 'shell command' });
  
  // Prepare shortcuts data
  const shortcutItems: HelpItem[] = [
    { key: 'Enter', description: 'Send message' },
    {
      key: process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J',
      description: process.platform === 'linux'
        ? 'New line (Alt+Enter works for certain linux distros)'
        : 'New line',
    },
    { key: 'Up/Down', description: 'Cycle through your prompt history' },
    { key: 'Alt+Left/Right', description: 'Jump through words in the input' },
    { key: 'Shift+Tab', description: 'Toggle auto-accepting edits' },
    { key: 'Esc', description: 'Cancel operation' },
    { key: 'Ctrl+C', description: 'Quit application' },
  ];
  
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderColor={Colors.Gray}
      borderStyle="round"
      padding={1}
      width={terminalWidth}
    >
      {/* Header */}
      <Text bold color={Colors.AccentPurple}>
        Trust CLI Help {terminalWidth >= 60 ? `(Terminal: ${terminalWidth} cols)` : ''}
      </Text>
      
      <Box height={1} />
      
      {/* Basics */}
      <Text bold color={Colors.Foreground}>
        Basics:
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Add context
        </Text>
        : Use{' '}
        <Text bold color={Colors.AccentPurple}>
          @
        </Text>{' '}
        to specify files (e.g.,{' '}
        <Text bold color={Colors.AccentPurple}>
          @src/myFile.ts
        </Text>
        ) to target specific files or folders.
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Shell mode
        </Text>
        : Execute commands via{' '}
        <Text bold color={Colors.AccentPurple}>
          !
        </Text>{' '}
        (e.g.,{' '}
        <Text bold color={Colors.AccentPurple}>
          !npm run start
        </Text>
        ) or use natural language.
      </Text>

      <Box height={1} />

      {/* Commands */}
      <Text bold color={Colors.Foreground}>
        Commands:
      </Text>
      {formatInColumns(commandItems, terminalWidth)}

      <Box height={1} />

      {/* Shortcuts */}
      <Text bold color={Colors.Foreground}>
        Keyboard Shortcuts:
      </Text>
      {formatInColumns(shortcutItems, terminalWidth)}
      
      {terminalWidth >= 80 && (
        <>
          <Box height={1} />
          <Text dimColor color={Colors.Gray}>
            Tip: Use full terminal width for better experience. Currently using {terminalWidth} columns.
          </Text>
        </>
      )}
    </Box>
  );
};
