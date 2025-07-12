/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react';
import { type PartListUnion } from '@google/genai';
import open from 'open';
import process from 'node:process';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useStateAndRef } from './useStateAndRef.js';
import {
  Config,
  GitService,
  Logger,
  MCPDiscoveryState,
  MCPServerStatus,
  getMCPDiscoveryState,
  getMCPServerStatus,
} from '@trust-cli/trust-cli-core';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  Message,
  MessageType,
  HistoryItemWithoutId,
  HistoryItem,
} from '../types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createShowMemoryAction } from './useShowMemoryCommand.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatDuration, formatMemoryUsage } from '../utils/formatters.js';
import { getCliVersion } from '../../utils/version.js';
import { LoadedSettings } from '../../config/settings.js';

export interface SlashCommandActionReturn {
  shouldScheduleTool?: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  message?: string; // For simple messages or errors
}

export interface SlashCommandSubCommand {
  name: string;
  description?: string;
}

export interface SlashCommand {
  name: string;
  altName?: string;
  description?: string;
  subCommands?: SlashCommandSubCommand[];
  completion?: () => Promise<string[]>;
  action: (
    mainCommand: string,
    subCommand?: string,
    args?: string,
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>; // Action can now return this object
}

/**
 * Hook to define and process slash commands (e.g., /help, /clear).
 */
export const useSlashCommandProcessor = (
  config: Config | null,
  settings: LoadedSettings,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  clearItems: UseHistoryManagerReturn['clearItems'],
  loadHistory: UseHistoryManagerReturn['loadHistory'],
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  onDebugMessage: (message: string) => void,
  openThemeDialog: () => void,
  openAuthDialog: () => void,
  openEditorDialog: () => void,
  performMemoryRefresh: () => Promise<void>,
  toggleCorgiMode: () => void,
  showToolDescriptions: boolean = false,
  setQuittingMessages: (message: HistoryItem[]) => void,
  openPrivacyNotice: () => void,
) => {
  const session = useSessionStats();
  const gitService = useMemo(() => {
    if (!config?.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot());
  }, [config]);

  const pendingHistoryItems: HistoryItemWithoutId[] = [];
  const [pendingCompressionItemRef, setPendingCompressionItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  if (pendingCompressionItemRef.current != null) {
    pendingHistoryItems.push(pendingCompressionItemRef.current);
  }

  const addMessage = useCallback(
    (message: Message) => {
      // Convert Message to HistoryItemWithoutId
      let historyItemContent: HistoryItemWithoutId;
      if (message.type === MessageType.ABOUT) {
        historyItemContent = {
          type: 'about',
          cliVersion: message.cliVersion,
          osVersion: message.osVersion,
          sandboxEnv: message.sandboxEnv,
          modelVersion: message.modelVersion,
          selectedAuthType: message.selectedAuthType,
          gcpProject: message.gcpProject,
        };
      } else if (message.type === MessageType.STATS) {
        historyItemContent = {
          type: 'stats',
          duration: message.duration,
        };
      } else if (message.type === MessageType.MODEL_STATS) {
        historyItemContent = {
          type: 'model_stats',
        };
      } else if (message.type === MessageType.TOOL_STATS) {
        historyItemContent = {
          type: 'tool_stats',
        };
      } else if (message.type === MessageType.QUIT) {
        historyItemContent = {
          type: 'quit',
          duration: message.duration,
        };
      } else if (message.type === MessageType.COMPRESSION) {
        historyItemContent = {
          type: 'compression',
          compression: message.compression,
        };
      } else {
        historyItemContent = {
          type: message.type,
          text: message.content,
        };
      }
      addItem(historyItemContent, message.timestamp.getTime());
    },
    [addItem],
  );

  const showMemoryAction = useCallback(async () => {
    const actionFn = createShowMemoryAction(config, settings, addMessage);
    await actionFn();
  }, [config, settings, addMessage]);

  const addMemoryAction = useCallback(
    (
      _mainCommand: string,
      _subCommand?: string,
      args?: string,
    ): SlashCommandActionReturn | void => {
      if (!args || args.trim() === '') {
        addMessage({
          type: MessageType.ERROR,
          content: 'Usage: /memory add <text to remember>',
          timestamp: new Date(),
        });
        return;
      }
      // UI feedback for attempting to schedule
      addMessage({
        type: MessageType.INFO,
        content: `Attempting to save to memory: "${args.trim()}"`,
        timestamp: new Date(),
      });
      // Return info for scheduling the tool call
      return {
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact: args.trim() },
      };
    },
    [addMessage],
  );

  const savedChatTags = useCallback(async () => {
    const geminiDir = config?.getProjectTempDir();
    if (!geminiDir) {
      return [];
    }
    try {
      const files = await fs.readdir(geminiDir);
      return files
        .filter(
          (file) => file.startsWith('checkpoint-') && file.endsWith('.json'),
        )
        .map((file) => file.replace('checkpoint-', '').replace('.json', ''));
    } catch (_err) {
      return [];
    }
  }, [config]);

  const slashCommands: SlashCommand[] = useMemo(() => {
    const commands: SlashCommand[] = [
      {
        name: 'help',
        altName: '?',
        description: 'for help on gemini-cli',
        action: (_mainCommand, _subCommand, _args) => {
          onDebugMessage('Opening help.');
          setShowHelp(true);
        },
      },
      {
        name: 'docs',
        description: 'open full Gemini CLI documentation in your browser',
        action: async (_mainCommand, _subCommand, _args) => {
          const docsUrl = 'https://goo.gle/gemini-cli-docs';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            addMessage({
              type: MessageType.INFO,
              content: `Please open the following URL in your browser to view the documentation:\n${docsUrl}`,
              timestamp: new Date(),
            });
          } else {
            addMessage({
              type: MessageType.INFO,
              content: `Opening documentation in your browser: ${docsUrl}`,
              timestamp: new Date(),
            });
            await open(docsUrl);
          }
        },
      },
      {
        name: 'clear',
        description: 'clear the screen and conversation history',
        action: async (_mainCommand, _subCommand, _args) => {
          onDebugMessage('Clearing terminal and resetting chat.');
          clearItems();
          await config?.getGeminiClient()?.resetChat();
          console.clear();
          refreshStatic();
        },
      },
      {
        name: 'theme',
        description: 'change the theme',
        action: (_mainCommand, _subCommand, _args) => {
          openThemeDialog();
        },
      },
      {
        name: 'auth',
        description: 'change the auth method',
        action: (_mainCommand, _subCommand, _args) => {
          openAuthDialog();
        },
      },
      {
        name: 'editor',
        description: 'set external editor preference',
        action: (_mainCommand, _subCommand, _args) => {
          openEditorDialog();
        },
      },
      {
        name: 'stats',
        altName: 'usage',
        description: 'check session stats. Usage: /stats [model|tools]',
        action: (_mainCommand, subCommand, _args) => {
          if (subCommand === 'model') {
            addMessage({
              type: MessageType.MODEL_STATS,
              timestamp: new Date(),
            });
            return;
          } else if (subCommand === 'tools') {
            addMessage({
              type: MessageType.TOOL_STATS,
              timestamp: new Date(),
            });
            return;
          }

          const now = new Date();
          const { sessionStartTime } = session.stats;
          const wallDuration = now.getTime() - sessionStartTime.getTime();

          addMessage({
            type: MessageType.STATS,
            duration: formatDuration(wallDuration),
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'mcp',
        description: 'list configured MCP servers and tools',
        action: async (_mainCommand, _subCommand, _args) => {
          // Check if the _subCommand includes a specific flag to control description visibility
          let useShowDescriptions = showToolDescriptions;
          if (_subCommand === 'desc' || _subCommand === 'descriptions') {
            useShowDescriptions = true;
          } else if (
            _subCommand === 'nodesc' ||
            _subCommand === 'nodescriptions'
          ) {
            useShowDescriptions = false;
          } else if (_args === 'desc' || _args === 'descriptions') {
            useShowDescriptions = true;
          } else if (_args === 'nodesc' || _args === 'nodescriptions') {
            useShowDescriptions = false;
          }
          // Check if the _subCommand includes a specific flag to show detailed tool schema
          let useShowSchema = false;
          if (_subCommand === 'schema' || _args === 'schema') {
            useShowSchema = true;
          }

          const toolRegistry = await config?.getToolRegistry();
          if (!toolRegistry) {
            addMessage({
              type: MessageType.ERROR,
              content: 'Could not retrieve tool registry.',
              timestamp: new Date(),
            });
            return;
          }

          const mcpServers = config?.getMcpServers() || {};
          const serverNames = Object.keys(mcpServers);

          if (serverNames.length === 0) {
            const docsUrl = 'https://goo.gle/gemini-cli-docs-mcp';
            if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
              addMessage({
                type: MessageType.INFO,
                content: `No MCP servers configured. Please open the following URL in your browser to view documentation:\n${docsUrl}`,
                timestamp: new Date(),
              });
            } else {
              addMessage({
                type: MessageType.INFO,
                content: `No MCP servers configured. Opening documentation in your browser: ${docsUrl}`,
                timestamp: new Date(),
              });
              await open(docsUrl);
            }
            return;
          }

          // Check if any servers are still connecting
          const connectingServers = serverNames.filter(
            (name) => getMCPServerStatus(name) === MCPServerStatus.CONNECTING,
          );
          const discoveryState = getMCPDiscoveryState();

          let message = '';

          // Add overall discovery status message if needed
          if (
            discoveryState === MCPDiscoveryState.IN_PROGRESS ||
            connectingServers.length > 0
          ) {
            message += `\u001b[33m⏳ MCP servers are starting up (${connectingServers.length} initializing)...\u001b[0m\n`;
            message += `\u001b[90mNote: First startup may take longer. Tool availability will update automatically.\u001b[0m\n\n`;
          }

          message += 'Configured MCP servers:\n\n';

          for (const serverName of serverNames) {
            const serverTools = toolRegistry.getToolsByServer(serverName);
            const status = getMCPServerStatus(serverName);

            // Add status indicator with descriptive text
            let statusIndicator = '';
            let statusText = '';
            switch (status) {
              case MCPServerStatus.CONNECTED:
                statusIndicator = '🟢';
                statusText = 'Ready';
                break;
              case MCPServerStatus.CONNECTING:
                statusIndicator = '🔄';
                statusText = 'Starting... (first startup may take longer)';
                break;
              case MCPServerStatus.DISCONNECTED:
              default:
                statusIndicator = '🔴';
                statusText = 'Disconnected';
                break;
            }

            // Get server description if available
            const server = mcpServers[serverName];

            // Format server header with bold formatting and status
            message += `${statusIndicator} \u001b[1m${serverName}\u001b[0m - ${statusText}`;

            // Add tool count with conditional messaging
            if (status === MCPServerStatus.CONNECTED) {
              message += ` (${serverTools.length} tools)`;
            } else if (status === MCPServerStatus.CONNECTING) {
              message += ` (tools will appear when ready)`;
            } else {
              message += ` (${serverTools.length} tools cached)`;
            }

            // Add server description with proper handling of multi-line descriptions
            if ((useShowDescriptions || useShowSchema) && server?.description) {
              const greenColor = '\u001b[32m';
              const resetColor = '\u001b[0m';

              const descLines = server.description.trim().split('\n');
              if (descLines) {
                message += ':\n';
                for (const descLine of descLines) {
                  message += `    ${greenColor}${descLine}${resetColor}\n`;
                }
              } else {
                message += '\n';
              }
            } else {
              message += '\n';
            }

            // Reset formatting after server entry
            message += '\u001b[0m';

            if (serverTools.length > 0) {
              serverTools.forEach((tool) => {
                if (
                  (useShowDescriptions || useShowSchema) &&
                  tool.description
                ) {
                  // Format tool name in cyan using simple ANSI cyan color
                  message += `  - \u001b[36m${tool.name}\u001b[0m`;

                  // Apply green color to the description text
                  const greenColor = '\u001b[32m';
                  const resetColor = '\u001b[0m';

                  // Handle multi-line descriptions by properly indenting and preserving formatting
                  const descLines = tool.description.trim().split('\n');
                  if (descLines) {
                    message += ':\n';
                    for (const descLine of descLines) {
                      message += `      ${greenColor}${descLine}${resetColor}\n`;
                    }
                  } else {
                    message += '\n';
                  }
                  // Reset is handled inline with each line now
                } else {
                  // Use cyan color for the tool name even when not showing descriptions
                  message += `  - \u001b[36m${tool.name}\u001b[0m\n`;
                }
                if (useShowSchema) {
                  // Prefix the parameters in cyan
                  message += `    \u001b[36mParameters:\u001b[0m\n`;
                  // Apply green color to the parameter text
                  const greenColor = '\u001b[32m';
                  const resetColor = '\u001b[0m';

                  const paramsLines = JSON.stringify(
                    tool.schema.parameters,
                    null,
                    2,
                  )
                    .trim()
                    .split('\n');
                  if (paramsLines) {
                    for (const paramsLine of paramsLines) {
                      message += `      ${greenColor}${paramsLine}${resetColor}\n`;
                    }
                  }
                }
              });
            } else {
              message += '  No tools available\n';
            }
            message += '\n';
          }

          // Make sure to reset any ANSI formatting at the end to prevent it from affecting the terminal
          message += '\u001b[0m';

          addMessage({
            type: MessageType.INFO,
            content: message,
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'memory',
        description:
          'manage memory. Usage: /memory <show|refresh|add> [text for add]',
        action: (mainCommand, subCommand, args) => {
          switch (subCommand) {
            case 'show':
              showMemoryAction();
              return;
            case 'refresh':
              performMemoryRefresh();
              return;
            case 'add':
              return addMemoryAction(mainCommand, subCommand, args); // Return the object
            case undefined:
              addMessage({
                type: MessageType.ERROR,
                content:
                  'Missing command\nUsage: /memory <show|refresh|add> [text for add]',
                timestamp: new Date(),
              });
              return;
            default:
              addMessage({
                type: MessageType.ERROR,
                content: `Unknown /memory command: ${subCommand}. Available: show, refresh, add`,
                timestamp: new Date(),
              });
              return;
          }
        },
      },
      {
        name: 'tools',
        description: 'list available Gemini CLI tools',
        action: async (_mainCommand, _subCommand, _args) => {
          // Check if the _subCommand includes a specific flag to control description visibility
          let useShowDescriptions = showToolDescriptions;
          if (_subCommand === 'desc' || _subCommand === 'descriptions') {
            useShowDescriptions = true;
          } else if (
            _subCommand === 'nodesc' ||
            _subCommand === 'nodescriptions'
          ) {
            useShowDescriptions = false;
          } else if (_args === 'desc' || _args === 'descriptions') {
            useShowDescriptions = true;
          } else if (_args === 'nodesc' || _args === 'nodescriptions') {
            useShowDescriptions = false;
          }

          const toolRegistry = await config?.getToolRegistry();
          const tools = toolRegistry?.getAllTools();
          if (!tools) {
            addMessage({
              type: MessageType.ERROR,
              content: 'Could not retrieve tools.',
              timestamp: new Date(),
            });
            return;
          }

          // Filter out MCP tools by checking if they have a serverName property
          const geminiTools = tools.filter((tool) => !('serverName' in tool));

          let message = 'Available Gemini CLI tools:\n\n';

          if (geminiTools.length > 0) {
            geminiTools.forEach((tool) => {
              if (useShowDescriptions && tool.description) {
                // Format tool name in cyan using simple ANSI cyan color
                message += `  - \u001b[36m${tool.displayName} (${tool.name})\u001b[0m:\n`;

                // Apply green color to the description text
                const greenColor = '\u001b[32m';
                const resetColor = '\u001b[0m';

                // Handle multi-line descriptions by properly indenting and preserving formatting
                const descLines = tool.description.trim().split('\n');

                // If there are multiple lines, add proper indentation for each line
                if (descLines) {
                  for (const descLine of descLines) {
                    message += `      ${greenColor}${descLine}${resetColor}\n`;
                  }
                }
              } else {
                // Use cyan color for the tool name even when not showing descriptions
                message += `  - \u001b[36m${tool.displayName}\u001b[0m\n`;
              }
            });
          } else {
            message += '  No tools available\n';
          }
          message += '\n';

          // Make sure to reset any ANSI formatting at the end to prevent it from affecting the terminal
          message += '\u001b[0m';

          addMessage({
            type: MessageType.INFO,
            content: message,
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'corgi',
        action: (_mainCommand, _subCommand, _args) => {
          toggleCorgiMode();
        },
      },
      {
        name: 'about',
        description: 'show version info',
        action: async (_mainCommand, _subCommand, _args) => {
          const osVersion = process.platform;
          let sandboxEnv = 'no sandbox';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            sandboxEnv = process.env.SANDBOX;
          } else if (process.env.SANDBOX === 'sandbox-exec') {
            sandboxEnv = `sandbox-exec (${
              process.env.SEATBELT_PROFILE || 'unknown'
            })`;
          }
          const modelVersion = config?.getModel() || 'Unknown';
          const cliVersion = await getCliVersion();
          const selectedAuthType = settings.merged.selectedAuthType || '';
          const gcpProject = process.env.GOOGLE_CLOUD_PROJECT || '';
          addMessage({
            type: MessageType.ABOUT,
            timestamp: new Date(),
            cliVersion,
            osVersion,
            sandboxEnv,
            modelVersion,
            selectedAuthType,
            gcpProject,
          });
        },
      },
      {
        name: 'bug',
        description: 'submit a bug report',
        action: async (_mainCommand, _subCommand, args) => {
          let bugDescription = _subCommand || '';
          if (args) {
            bugDescription += ` ${args}`;
          }
          bugDescription = bugDescription.trim();

          const osVersion = `${process.platform} ${process.version}`;
          let sandboxEnv = 'no sandbox';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            sandboxEnv = process.env.SANDBOX.replace(/^gemini-(?:code-)?/, '');
          } else if (process.env.SANDBOX === 'sandbox-exec') {
            sandboxEnv = `sandbox-exec (${
              process.env.SEATBELT_PROFILE || 'unknown'
            })`;
          }
          const modelVersion = config?.getModel() || 'Unknown';
          const cliVersion = await getCliVersion();
          const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);

          const info = `
*   **CLI Version:** ${cliVersion}
*   **Git Commit:** ${GIT_COMMIT_INFO}
*   **Operating System:** ${osVersion}
*   **Sandbox Environment:** ${sandboxEnv}
*   **Model Version:** ${modelVersion}
*   **Memory Usage:** ${memoryUsage}
`;

          let bugReportUrl =
            'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}';
          const bugCommand = config?.getBugCommand();
          if (bugCommand?.urlTemplate) {
            bugReportUrl = bugCommand.urlTemplate;
          }
          bugReportUrl = bugReportUrl
            .replace('{title}', encodeURIComponent(bugDescription))
            .replace('{info}', encodeURIComponent(info));

          addMessage({
            type: MessageType.INFO,
            content: `To submit your bug report, please open the following URL in your browser:\n${bugReportUrl}`,
            timestamp: new Date(),
          });
          (async () => {
            try {
              await open(bugReportUrl);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              addMessage({
                type: MessageType.ERROR,
                content: `Could not open URL in browser: ${errorMessage}`,
                timestamp: new Date(),
              });
            }
          })();
        },
      },
      {
        name: 'chat',
        description:
          'Manage conversation history. Usage: /chat <list|save|resume> <tag>',
        action: async (_mainCommand, subCommand, args) => {
          const tag = (args || '').trim();
          const logger = new Logger(config?.getSessionId() || '');
          await logger.initialize();
          const chat = await config?.getGeminiClient()?.getChat();
          if (!chat) {
            addMessage({
              type: MessageType.ERROR,
              content: 'No chat client available for conversation status.',
              timestamp: new Date(),
            });
            return;
          }
          if (!subCommand) {
            addMessage({
              type: MessageType.ERROR,
              content: 'Missing command\nUsage: /chat <list|save|resume> <tag>',
              timestamp: new Date(),
            });
            return;
          }
          switch (subCommand) {
            case 'save': {
              if (!tag) {
                addMessage({
                  type: MessageType.ERROR,
                  content: 'Missing tag. Usage: /chat save <tag>',
                  timestamp: new Date(),
                });
                return;
              }
              const history = chat.getHistory();
              if (history.length > 0) {
                await logger.saveCheckpoint(chat?.getHistory() || [], tag);
                addMessage({
                  type: MessageType.INFO,
                  content: `Conversation checkpoint saved with tag: ${tag}.`,
                  timestamp: new Date(),
                });
              } else {
                addMessage({
                  type: MessageType.INFO,
                  content: 'No conversation found to save.',
                  timestamp: new Date(),
                });
              }
              return;
            }
            case 'resume':
            case 'restore':
            case 'load': {
              if (!tag) {
                addMessage({
                  type: MessageType.ERROR,
                  content: 'Missing tag. Usage: /chat resume <tag>',
                  timestamp: new Date(),
                });
                return;
              }
              const conversation = await logger.loadCheckpoint(tag);
              if (conversation.length === 0) {
                addMessage({
                  type: MessageType.INFO,
                  content: `No saved checkpoint found with tag: ${tag}.`,
                  timestamp: new Date(),
                });
                return;
              }

              clearItems();
              chat.clearHistory();
              const rolemap: { [key: string]: MessageType } = {
                user: MessageType.USER,
                model: MessageType.GEMINI,
              };
              let hasSystemPrompt = false;
              let i = 0;
              for (const item of conversation) {
                i += 1;

                // Add each item to history regardless of whether we display
                // it.
                chat.addHistory(item);

                const text =
                  item.parts
                    ?.filter((m) => !!m.text)
                    .map((m) => m.text)
                    .join('') || '';
                if (!text) {
                  // Parsing Part[] back to various non-text output not yet implemented.
                  continue;
                }
                if (i === 1 && text.match(/context for our chat/)) {
                  hasSystemPrompt = true;
                }
                if (i > 2 || !hasSystemPrompt) {
                  addItem(
                    {
                      type:
                        (item.role && rolemap[item.role]) || MessageType.GEMINI,
                      text,
                    } as HistoryItemWithoutId,
                    i,
                  );
                }
              }
              console.clear();
              refreshStatic();
              return;
            }
            case 'list':
              addMessage({
                type: MessageType.INFO,
                content:
                  'list of saved conversations: ' +
                  (await savedChatTags()).join(', '),
                timestamp: new Date(),
              });
              return;
            default:
              addMessage({
                type: MessageType.ERROR,
                content: `Unknown /chat command: ${subCommand}. Available: list, save, resume`,
                timestamp: new Date(),
              });
              return;
          }
        },
        completion: async () =>
          (await savedChatTags()).map((tag) => 'resume ' + tag),
      },
      {
        name: 'status',
        description: 'show AI backend status and configuration',
        action: async (_mainCommand, subCommand, _args) => {
          const handler = await import('../../commands/statusCommands.js');
          const statusHandler = new handler.StatusCommandHandler();

          // Capture console output
          const _originalLog = console.log;
          let output = '';
          console.log = (...args) => {
            output += args.join(' ') + '\n';
          };

          try {
            await statusHandler.handleCommand({
              action:
                (subCommand as 'show' | 'backend' | 'model' | 'all') || 'all',
              verbose: _args === 'verbose' || _args === '--verbose',
            });
          } finally {
            console.log = _originalLog;
          }

          addMessage({
            type: MessageType.INFO,
            content: output.trim(),
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'backend',
        description:
          'manage AI backend configuration. Usage: /backend <list|switch|test>',
        action: async (_mainCommand, subCommand, args) => {
          const handler = await import('../../commands/configCommands.js');
          const configHandler = new handler.ConfigCommandHandler();

          // Capture console output
          const _originalLog = console.log;
          const _originalError = console.error;
          let _output = '';
          console.log = (...args) => {
            _output += args.join(' ') + '\n';
          };
          console.error = (...args) => {
            _output += args.join(' ') + '\n';
          };

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let commandArgs: any;

            if (!subCommand || subCommand === 'show' || subCommand === 'list') {
              // Show backend status - use status command for this
              const statusHandler = await import(
                '../../commands/statusCommands.js'
              );
              const statusCmd = new statusHandler.StatusCommandHandler();
              await statusCmd.handleCommand({
                action: 'backend',
                verbose: false,
              });
            } else if (subCommand === 'switch' && args) {
              // Switch to specified backend
              const backend = args.trim();
              if (!['ollama', 'huggingface', 'cloud'].includes(backend)) {
                throw new Error(
                  `Invalid backend: ${backend}. Valid options: ollama, huggingface, cloud`,
                );
              }
              commandArgs = {
                action: 'backend',
                backend: backend as 'ollama' | 'huggingface' | 'cloud',
              };
              await configHandler.handleCommand(commandArgs);
            } else {
              throw new Error('Usage: /backend [show|switch] [backend-name]');
            }
          } catch (error) {
            _output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
          } finally {
            console.log = _originalLog;
            console.error = _originalError;
          }

          addMessage({
            type: _output.includes('Error:')
              ? MessageType.ERROR
              : MessageType.INFO,
            content: _output.trim(),
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'openaudit',
        description:
          'open audit management. Usage: /openaudit <new|list|report> [options]',
        action: async (_mainCommand, subCommand, args) => {
          if (!subCommand) {
            addMessage({
              type: MessageType.ERROR,
              content:
                'Missing command\nUsage: /openaudit <new|list|report> [options]',
              timestamp: new Date(),
            });
            return;
          }

          try {
            const handler = await import('../../commands/openauditCommands.js');
            const openAuditHandler = new handler.OpenAuditCommandHandler();

            // Capture console output
            const _originalLog = console.log;
            const _originalError = console.error;
            let _output = '';
            console.log = (...args) => {
              _output += args.join(' ') + '\n';
            };
            console.error = (...args) => {
              _output += args.join(' ') + '\n';
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const commandArgs: any = {
              action: subCommand,
            };

            // Parse arguments for different subcommands
            if (subCommand === 'new' && args) {
              // Parse args like "name:TestAudit type:soc2"
              const argPairs = args.split(/\s+/);
              argPairs.forEach((pair) => {
                const [key, value] = pair.split(':');
                if (key && value) {
                  commandArgs[key] = value;
                }
              });
            } else if (subCommand === 'report' && args) {
              const argParts = args.split(/\s+/);
              commandArgs.id = argParts[0];
              if (argParts[1] === '--output' && argParts[2]) {
                commandArgs.output = argParts[2];
              }
            }

            await openAuditHandler.handleCommand(commandArgs);
          } catch (error) {
            _output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
          } finally {
            console.log = _originalLog;
            console.error = _originalError;
          }

          addMessage({
            type: _output.includes('Error:')
              ? MessageType.ERROR
              : MessageType.INFO,
            content: _output.trim(),
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'privacy',
        description:
          'manage privacy settings. Usage: /privacy <status|switch|list|info> [mode]',
        action: async (_mainCommand, subCommand, args) => {
          if (subCommand === undefined) {
            // If no subcommand, show the privacy notice dialog
            openPrivacyNotice();
            return;
          }

          const handler = await import('../../commands/privacyCommands.js');
          const privacyHandler = new handler.PrivacyCommandHandler();

          // Capture console output
          const _originalLog = console.log;
          const _originalError = console.error;
          let _output = '';
          console.log = (...args) => {
            _output += args.join(' ') + '\n';
          };
          console.error = (...args) => {
            _output += args.join(' ') + '\n';
          };

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const commandArgs: any = {
              action: subCommand,
              verbose: args === '--verbose' || args === 'verbose',
            };

            if (subCommand === 'switch' && args && !args.startsWith('--')) {
              commandArgs.mode = args.split(/\s+/)[0] as
                | 'strict'
                | 'moderate'
                | 'open';
            } else if (
              subCommand === 'info' &&
              args &&
              !args.startsWith('--')
            ) {
              commandArgs.mode = args.split(/\s+/)[0] as
                | 'strict'
                | 'moderate'
                | 'open';
            }

            await privacyHandler.handleCommand(commandArgs);
          } catch (error) {
            _output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
          } finally {
            console.log = _originalLog;
            console.error = _originalError;
          }

          addMessage({
            type: _output.includes('Error:')
              ? MessageType.ERROR
              : MessageType.INFO,
            content: _output.trim(),
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'model',
        description:
          'manage AI models. Usage: /model <list|download|verify|info> [model-name]',
        action: async (_mainCommand, subCommand, args) => {
          try {
            const handler = await import('../../commands/modelCommands.js');
            const modelHandler = new handler.ModelCommandHandler();

            // Capture console output
            const _originalLog = console.log;
            const _originalError = console.error;
            let _output = '';
            console.log = (...args) => {
              _output += args.join(' ') + '\n';
            };
            console.error = (...args) => {
              _output += args.join(' ') + '\n';
            };

            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const commandArgs: any = {
                action: subCommand || 'list',
              };

              if (
                (subCommand === 'download' ||
                  subCommand === 'verify' ||
                  subCommand === 'info') &&
                args
              ) {
                commandArgs.model = args.trim();
              } else if (subCommand === 'list' && args === '--verbose') {
                commandArgs.verbose = true;
              }

              await modelHandler.handleCommand(commandArgs);
            } catch (error) {
              _output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
            } finally {
              console.log = _originalLog;
              console.error = _originalError;
            }

            addMessage({
              type: _output.includes('Error:')
                ? MessageType.ERROR
                : MessageType.INFO,
              content: _output.trim(),
              timestamp: new Date(),
            });
          } catch (importError) {
            addMessage({
              type: MessageType.ERROR,
              content: `Model commands not available: ${importError instanceof Error ? importError.message : String(importError)}`,
              timestamp: new Date(),
            });
          }
        },
      },
      {
        name: 'config',
        description:
          'manage configuration. Usage: /config <show|get|set> [key] [value]',
        action: async (_mainCommand, subCommand, args) => {
          try {
            const handler = await import('../../commands/configCommands.js');
            const configHandler = new handler.ConfigCommandHandler();

            // Capture console output
            const _originalLog = console.log;
            const _originalError = console.error;
            let _output = '';
            console.log = (...args) => {
              _output += args.join(' ') + '\n';
            };
            console.error = (...args) => {
              _output += args.join(' ') + '\n';
            };

            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const commandArgs: any = {
                action: subCommand || 'show',
              };

              if (subCommand === 'get' && args) {
                commandArgs.key = args.trim();
              } else if (subCommand === 'set' && args) {
                const argParts = args.split(/\s+/);
                commandArgs.key = argParts[0];
                commandArgs.value = argParts.slice(1).join(' ');
              } else if (subCommand === 'show' && args === '--verbose') {
                commandArgs.verbose = true;
              }

              await configHandler.handleCommand(commandArgs);
            } catch (error) {
              _output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
            } finally {
              console.log = _originalLog;
              console.error = _originalError;
            }

            addMessage({
              type: _output.includes('Error:')
                ? MessageType.ERROR
                : MessageType.INFO,
              content: _output.trim(),
              timestamp: new Date(),
            });
          } catch (importError) {
            addMessage({
              type: MessageType.ERROR,
              content: `Config commands not available: ${importError instanceof Error ? importError.message : String(importError)}`,
              timestamp: new Date(),
            });
          }
        },
      },
      {
        name: 'model-enhanced',
        description: 'unified model management across all backends',
        subCommands: [
          {
            name: 'list-all',
            description: 'List all available models from all backends',
          },
          {
            name: 'discover',
            description: 'Discover models from all backends',
          },
          { name: 'filter', description: 'Filter models based on criteria' },
          { name: 'recommend', description: 'Get model recommendations' },
          { name: 'backends', description: 'Show backend information' },
          {
            name: 'smart-default',
            description: 'Get intelligent default model',
          },
          { name: 'smart-recommend', description: 'Get smart recommendations' },
          { name: 'routing-info', description: 'Show routing information' },
          {
            name: 'transparency',
            description: 'Show transparency information',
          },
          { name: 'auto-select', description: 'Auto-select best model' },
          { name: 'resource-check', description: 'Check system resources' },
          { name: 'optimize', description: 'Optimize model selection' },
          { name: 'system-report', description: 'Generate system report' },
          { name: 'error-help', description: 'Get help with errors' },
        ],
        action: async (_mainCommand, subCommand, args) => {
          try {
            const handler = await import(
              '../../commands/enhancedModelCommands.js'
            );

            // Capture console output
            const _originalLog = console.log;
            const _originalError = console.error;
            let _output = '';
            console.log = (...args) => {
              _output += args.join(' ') + '\n';
            };
            console.error = (...args) => {
              _output += args.join(' ') + '\n';
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const commandArgs: any = {
              action: subCommand || 'list-all',
            };

            // Parse arguments based on subcommand
            if (args) {
              const argParts = args.split(/\s+/);
              argParts.forEach((arg, index) => {
                if (arg === '--task' && argParts[index + 1]) {
                  commandArgs.task = argParts[index + 1];
                } else if (arg === '--ram-limit' && argParts[index + 1]) {
                  commandArgs.ramLimit = parseInt(argParts[index + 1], 10);
                } else if (arg === '--backend' && argParts[index + 1]) {
                  commandArgs.backend = argParts[index + 1];
                } else if (arg === '--verbose') {
                  commandArgs.verbose = true;
                }
              });
            }

            await handler.handleEnhancedModelCommand(commandArgs);

            addMessage({
              type: MessageType.INFO,
              content: _output.trim(),
              timestamp: new Date(),
            });
          } catch (error) {
            addMessage({
              type: MessageType.ERROR,
              content: `Enhanced model commands failed: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date(),
            });
          }
        },
      },
      {
        name: 'quit',
        altName: 'exit',
        description: 'exit the cli',
        action: async (mainCommand, _subCommand, _args) => {
          const now = new Date();
          const { sessionStartTime } = session.stats;
          const wallDuration = now.getTime() - sessionStartTime.getTime();

          setQuittingMessages([
            {
              type: 'user',
              text: `/${mainCommand}`,
              id: now.getTime() - 1,
            },
            {
              type: 'quit',
              duration: formatDuration(wallDuration),
              id: now.getTime(),
            },
          ]);

          setTimeout(() => {
            process.exit(0);
          }, 100);
        },
      },
      {
        name: 'compress',
        altName: 'summarize',
        description: 'Compresses the context by replacing it with a summary.',
        action: async (_mainCommand, _subCommand, _args) => {
          if (pendingCompressionItemRef.current !== null) {
            addMessage({
              type: MessageType.ERROR,
              content:
                'Already compressing, wait for previous request to complete',
              timestamp: new Date(),
            });
            return;
          }
          setPendingCompressionItem({
            type: MessageType.COMPRESSION,
            compression: {
              isPending: true,
              originalTokenCount: null,
              newTokenCount: null,
            },
          });
          try {
            const compressed = await config!
              .getGeminiClient()!
              .tryCompressChat(true);
            if (compressed) {
              addMessage({
                type: MessageType.COMPRESSION,
                compression: {
                  isPending: false,
                  originalTokenCount: compressed.originalTokenCount,
                  newTokenCount: compressed.newTokenCount,
                },
                timestamp: new Date(),
              });
            } else {
              addMessage({
                type: MessageType.ERROR,
                content: 'Failed to compress chat history.',
                timestamp: new Date(),
              });
            }
          } catch (e) {
            addMessage({
              type: MessageType.ERROR,
              content: `Failed to compress chat history: ${e instanceof Error ? e.message : String(e)}`,
              timestamp: new Date(),
            });
          }
          setPendingCompressionItem(null);
        },
      },
    ];

    if (config?.getCheckpointingEnabled()) {
      commands.push({
        name: 'restore',
        description:
          'restore a tool call. This will reset the conversation and file history to the state it was in when the tool call was suggested',
        completion: async () => {
          const checkpointDir = config?.getProjectTempDir()
            ? path.join(config.getProjectTempDir(), 'checkpoints')
            : undefined;
          if (!checkpointDir) {
            return [];
          }
          try {
            const files = await fs.readdir(checkpointDir);
            return files
              .filter((file) => file.endsWith('.json'))
              .map((file) => file.replace('.json', ''));
          } catch (_err) {
            return [];
          }
        },
        action: async (_mainCommand, subCommand, _args) => {
          const checkpointDir = config?.getProjectTempDir()
            ? path.join(config.getProjectTempDir(), 'checkpoints')
            : undefined;

          if (!checkpointDir) {
            addMessage({
              type: MessageType.ERROR,
              content: 'Could not determine the .gemini directory path.',
              timestamp: new Date(),
            });
            return;
          }

          try {
            // Ensure the directory exists before trying to read it.
            await fs.mkdir(checkpointDir, { recursive: true });
            const files = await fs.readdir(checkpointDir);
            const jsonFiles = files.filter((file) => file.endsWith('.json'));

            if (!subCommand) {
              if (jsonFiles.length === 0) {
                addMessage({
                  type: MessageType.INFO,
                  content: 'No restorable tool calls found.',
                  timestamp: new Date(),
                });
                return;
              }
              const truncatedFiles = jsonFiles.map((file) => {
                const components = file.split('.');
                if (components.length <= 1) {
                  return file;
                }
                components.pop();
                return components.join('.');
              });
              const fileList = truncatedFiles.join('\n');
              addMessage({
                type: MessageType.INFO,
                content: `Available tool calls to restore:\n\n${fileList}`,
                timestamp: new Date(),
              });
              return;
            }

            const selectedFile = subCommand.endsWith('.json')
              ? subCommand
              : `${subCommand}.json`;

            if (!jsonFiles.includes(selectedFile)) {
              addMessage({
                type: MessageType.ERROR,
                content: `File not found: ${selectedFile}`,
                timestamp: new Date(),
              });
              return;
            }

            const filePath = path.join(checkpointDir, selectedFile);
            const data = await fs.readFile(filePath, 'utf-8');
            const toolCallData = JSON.parse(data);

            if (toolCallData.history) {
              loadHistory(toolCallData.history);
            }

            if (toolCallData.clientHistory) {
              await config
                ?.getGeminiClient()
                ?.setHistory(toolCallData.clientHistory);
            }

            if (toolCallData.commitHash) {
              await gitService?.restoreProjectFromSnapshot(
                toolCallData.commitHash,
              );
              addMessage({
                type: MessageType.INFO,
                content: `Restored project to the state before the tool call.`,
                timestamp: new Date(),
              });
            }

            return {
              shouldScheduleTool: true,
              toolName: toolCallData.toolCall.name,
              toolArgs: toolCallData.toolCall.args,
            };
          } catch (error) {
            addMessage({
              type: MessageType.ERROR,
              content: `Could not read restorable tool calls. This is the error: ${error}`,
              timestamp: new Date(),
            });
          }
        },
      });
    }

    // Admin commands for system-wide management
    commands.push({
      name: 'admin',
      description: 'system administration and policy management',
      subCommands: [
        { name: 'status', description: 'Show administrative status' },
        { name: 'policy', description: 'Manage administrative policies' },
        { name: 'users', description: 'Manage user configurations' },
        { name: 'audit', description: 'Audit log management' },
        { name: 'defaults', description: 'System-wide defaults' },
        { name: 'security', description: 'Security management' },
        { name: 'compliance', description: 'Compliance framework management' },
        { name: 'bulk', description: 'Bulk operations' },
        { name: 'override', description: 'User configuration overrides' },
      ],
      action: async (_mainCommand, subCommand, args) => {
        try {
          const handler = await import('../../commands/adminCommands.js');
          const adminHandler = new handler.AdminCommandHandler();

          // Capture console output
          const _originalLog = console.log;
          const _originalError = console.error;
          let _output = '';
          console.log = (...args) => {
            _output += args.join(' ') + '\n';
          };
          console.error = (...args) => {
            _output += args.join(' ') + '\n';
          };

          try {
            // Parse the command structure
            const commandArgs: any = {
              action: subCommand || 'status',
            };

            // Parse arguments based on structure
            if (args) {
              const argParts = args.trim().split(/\s+/);
              
              // Handle different argument patterns
              if (argParts.length > 0 && argParts[0] !== '') {
                commandArgs.subaction = argParts[0];
                
                if (argParts.length > 1) {
                  commandArgs.target = argParts[1];
                }
                
                if (argParts.length > 2) {
                  commandArgs.value = argParts.slice(2).join(' ');
                }
                
                // Parse flags
                if (args.includes('--force')) {
                  commandArgs.force = true;
                }
                if (args.includes('--verbose')) {
                  commandArgs.verbose = true;
                }
                
                // Parse specific options
                const policyMatch = args.match(/--policy\s+(\S+)/);
                if (policyMatch) {
                  commandArgs.policy = policyMatch[1];
                }
                
                const frameworkMatch = args.match(/--framework\s+(\S+)/);
                if (frameworkMatch) {
                  commandArgs.framework = frameworkMatch[1];
                }
                
                const outputMatch = args.match(/--output\s+(\S+)/);
                if (outputMatch) {
                  commandArgs.output = outputMatch[1];
                }
              }
            }

            await adminHandler.handleCommand(commandArgs);
          } catch (error) {
            _output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
          } finally {
            console.log = _originalLog;
            console.error = _originalError;
          }

          if (_output) {
            addMessage({
              type: MessageType.INFO,
              content: _output.trim(),
              timestamp: new Date(),
            });
          }
        } catch (importError) {
          addMessage({
            type: MessageType.ERROR,
            content: `Failed to load admin commands: ${importError instanceof Error ? importError.message : String(importError)}`,
            timestamp: new Date(),
          });
        }
      },
    });

    // Security commands for dependency vulnerability scanning
    commands.push({
      name: 'security',
      description: 'dependency vulnerability scanning and security management',
      subCommands: [
        { name: 'scan', description: 'Scan project for vulnerabilities' },
        { name: 'monitor', description: 'Setup continuous monitoring' },
        { name: 'report', description: 'Generate security reports' },
        { name: 'remediate', description: 'Apply security fixes' },
        { name: 'configure', description: 'Configure security settings' },
        { name: 'status', description: 'Show security status' },
      ],
      action: async (_mainCommand, subCommand, args) => {
        try {
          const handler = await import('../../commands/securityCommands.js');

          // Capture console output
          const _originalLog = console.log;
          const _originalError = console.error;
          let _output = '';
          console.log = (...args) => {
            _output += args.join(' ') + '\n';
          };
          console.error = (...args) => {
            _output += args.join(' ') + '\n';
          };

          try {
            // Parse the command structure
            const commandArgs: any = {
              action: subCommand || 'status',
            };

            // Parse arguments based on structure
            if (args) {
              const argParts = args.trim().split(/\s+/);
              
              // Handle different argument patterns
              if (argParts.length > 0 && argParts[0] !== '') {
                commandArgs.subaction = argParts[0];
                
                if (argParts.length > 1) {
                  commandArgs.path = argParts[1];
                }
                
                // Parse flags
                if (args.includes('--autofix')) {
                  commandArgs.autofix = true;
                }
                if (args.includes('--force')) {
                  commandArgs.force = true;
                }
                if (args.includes('--verbose')) {
                  commandArgs.verbose = true;
                }
                if (args.includes('--continuous')) {
                  commandArgs.continuous = true;
                }
                
                // Parse specific options
                const formatMatch = args.match(/--format\s+(\S+)/);
                if (formatMatch) {
                  commandArgs.format = formatMatch[1];
                }
                
                const outputMatch = args.match(/--output\s+(\S+)/);
                if (outputMatch) {
                  commandArgs.output = outputMatch[1];
                }
                
                const severityMatch = args.match(/--severity\s+(\S+)/);
                if (severityMatch) {
                  commandArgs.severity = severityMatch[1];
                }
                
                const intervalMatch = args.match(/--interval-hours\s+(\d+)/);
                if (intervalMatch) {
                  commandArgs.intervalHours = parseInt(intervalMatch[1], 10);
                }
                
                const sourceMatch = args.match(/--sources\s+([^\s]+)/);
                if (sourceMatch) {
                  commandArgs.sources = sourceMatch[1].split(',');
                }
                
                const apiKeyMatch = args.match(/--api-key\s+(\S+)/);
                if (apiKeyMatch) {
                  commandArgs.apiKey = apiKeyMatch[1];
                }
                
                const serviceMatch = args.match(/--service\s+(\S+)/);
                if (serviceMatch) {
                  commandArgs.service = serviceMatch[1];
                }
              }
            }

            await handler.handleSecurityCommand(commandArgs);
          } catch (error) {
            _output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
          } finally {
            console.log = _originalLog;
            console.error = _originalError;
          }

          if (_output) {
            addMessage({
              type: MessageType.INFO,
              content: _output.trim(),
              timestamp: new Date(),
            });
          }
        } catch (importError) {
          addMessage({
            type: MessageType.ERROR,
            content: `Failed to load security commands: ${importError instanceof Error ? importError.message : String(importError)}`,
            timestamp: new Date(),
          });
        }
      },
    });

    return commands;
  }, [
    onDebugMessage,
    setShowHelp,
    refreshStatic,
    openThemeDialog,
    openAuthDialog,
    openEditorDialog,
    clearItems,
    performMemoryRefresh,
    showMemoryAction,
    addMemoryAction,
    addMessage,
    toggleCorgiMode,
    savedChatTags,
    config,
    settings,
    showToolDescriptions,
    session,
    gitService,
    loadHistory,
    addItem,
    setQuittingMessages,
    pendingCompressionItemRef,
    setPendingCompressionItem,
    openPrivacyNotice,
  ]);

  const handleSlashCommand = useCallback(
    async (
      rawQuery: PartListUnion,
    ): Promise<SlashCommandActionReturn | boolean> => {
      if (typeof rawQuery !== 'string') {
        return false;
      }
      const trimmed = rawQuery.trim();
      if (!trimmed.startsWith('/') && !trimmed.startsWith('?')) {
        return false;
      }
      const userMessageTimestamp = Date.now();
      if (trimmed !== '/quit' && trimmed !== '/exit') {
        addItem(
          { type: MessageType.USER, text: trimmed },
          userMessageTimestamp,
        );
      }

      let subCommand: string | undefined;
      let args: string | undefined;

      const commandToMatch = (() => {
        if (trimmed.startsWith('?')) {
          return 'help';
        }
        const parts = trimmed.substring(1).trim().split(/\s+/);
        if (parts.length > 1) {
          subCommand = parts[1];
        }
        if (parts.length > 2) {
          args = parts.slice(2).join(' ');
        }
        return parts[0];
      })();

      const mainCommand = commandToMatch;

      for (const cmd of slashCommands) {
        if (mainCommand === cmd.name || mainCommand === cmd.altName) {
          const actionResult = await cmd.action(mainCommand, subCommand, args);
          if (
            typeof actionResult === 'object' &&
            actionResult?.shouldScheduleTool
          ) {
            return actionResult; // Return the object for useGeminiStream
          }
          return true; // Command was handled, but no tool to schedule
        }
      }

      addMessage({
        type: MessageType.ERROR,
        content: `Unknown command: ${trimmed}`,
        timestamp: new Date(),
      });
      return true; // Indicate command was processed (even if unknown)
    },
    [addItem, slashCommands, addMessage],
  );

  return { handleSlashCommand, slashCommands, pendingHistoryItems };
};
