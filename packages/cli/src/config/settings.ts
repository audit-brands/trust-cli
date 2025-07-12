/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir, platform } from 'os';
import {
  MCPServerConfig,
  getErrorMessage,
  BugCommandSettings,
  TelemetrySettings,
  AuthType,
} from '@trust-cli/trust-cli-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';

export const SETTINGS_DIRECTORY_NAME = '.trust-cli';
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

function getSystemSettingsPath(): string {
  if (platform() === 'darwin') {
    return '/Library/Application Support/TrustCli/settings.json';
  } else if (platform() === 'win32') {
    return 'C:\\ProgramData\\trust-cli\\settings.json';
  } else {
    return '/etc/trust-cli/settings.json';
  }
}

export const SYSTEM_SETTINGS_PATH = getSystemSettingsPath();

export enum SettingScope {
  User = 'User',
  Workspace = 'Workspace',
  System = 'System',
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface Settings {
  theme?: string;
  selectedAuthType?: AuthType;
  sandbox?: boolean | string;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  preferredEditor?: string;
  bugCommand?: BugCommandSettings;
  checkpointing?: CheckpointingSettings;
  autoConfigureMaxOldSpaceSize?: boolean;

  // CLI Title customization
  customCliTitle?: string;

  // Context compression settings
  contextCompression?: {
    preserveRecentTurns?: number; // Number of recent turns to preserve (default: 6)
  };

  // Git-aware file filtering settings
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };

  // UI setting. Does not display the ANSI-controlled terminal title.
  hideWindowTitle?: boolean;
  hideTips?: boolean;

  // Add other settings here.
}

export interface SettingsError {
  message: string;
  path: string;
}

export interface SettingsFile {
  settings: Settings;
  path: string;
}
export class LoadedSettings {
  constructor(
    system: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    errors: SettingsError[],
  ) {
    this.system = system;
    this.user = user;
    this.workspace = workspace;
    this.errors = errors;
    this._merged = this.computeMergedSettings();
  }

  readonly system: SettingsFile;
  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly errors: SettingsError[];

  private _merged: Settings;

  get merged(): Settings {
    return this._merged;
  }

  private computeMergedSettings(): Settings {
    return {
      ...this.user.settings,
      ...this.workspace.settings,
      ...this.system.settings,
    };
  }

  forScope(scope: SettingScope): SettingsFile {
    switch (scope) {
      case SettingScope.User:
        return this.user;
      case SettingScope.Workspace:
        return this.workspace;
      case SettingScope.System:
        return this.system;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }
  }

  setValue(
    scope: SettingScope,
    key: keyof Settings,
    value: string | Record<string, MCPServerConfig> | undefined,
  ): void {
    const settingsFile = this.forScope(scope);
    // @ts-expect-error - value can be string | Record<string, MCPServerConfig>
    settingsFile.settings[key] = value;
    this._merged = this.computeMergedSettings();
    saveSettings(settingsFile);
  }
}

function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName]!;
    }
    return match;
  });
}

function resolveEnvVarsInObject<T>(obj: T): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = resolveEnvVarsInObject(newObj[key]);
      }
    }
    return newObj;
  }

  return obj;
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 */
export function loadSettings(workspaceDir: string): LoadedSettings {
  let systemSettings: Settings = {};
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];

  // Load system settings
  try {
    if (fs.existsSync(SYSTEM_SETTINGS_PATH)) {
      const systemContent = fs.readFileSync(SYSTEM_SETTINGS_PATH, 'utf-8');
      const parsedSystemSettings = JSON.parse(
        stripJsonComments(systemContent),
      ) as Settings;
      systemSettings = resolveEnvVarsInObject(parsedSystemSettings);
      // Support legacy theme names
      if (systemSettings.theme && systemSettings.theme === 'VS') {
        systemSettings.theme = DefaultLight.name;
      } else if (systemSettings.theme && systemSettings.theme === 'VS2015') {
        systemSettings.theme = DefaultDark.name;
      }
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: SYSTEM_SETTINGS_PATH,
    });
  }

  // Load user settings
  try {
    if (fs.existsSync(USER_SETTINGS_PATH)) {
      const userContent = fs.readFileSync(USER_SETTINGS_PATH, 'utf-8');
      const parsedUserSettings = JSON.parse(
        stripJsonComments(userContent),
      ) as Settings;
      userSettings = resolveEnvVarsInObject(parsedUserSettings);
      // Support legacy theme names
      if (userSettings.theme && userSettings.theme === 'VS') {
        userSettings.theme = DefaultLight.name;
      } else if (userSettings.theme && userSettings.theme === 'VS2015') {
        userSettings.theme = DefaultDark.name;
      }
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: USER_SETTINGS_PATH,
    });
  }

  const workspaceSettingsPath = path.join(
    workspaceDir,
    SETTINGS_DIRECTORY_NAME,
    'settings.json',
  );

  // Load workspace settings
  try {
    if (fs.existsSync(workspaceSettingsPath)) {
      const projectContent = fs.readFileSync(workspaceSettingsPath, 'utf-8');
      const parsedWorkspaceSettings = JSON.parse(
        stripJsonComments(projectContent),
      ) as Settings;
      workspaceSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
      if (workspaceSettings.theme && workspaceSettings.theme === 'VS') {
        workspaceSettings.theme = DefaultLight.name;
      } else if (
        workspaceSettings.theme &&
        workspaceSettings.theme === 'VS2015'
      ) {
        workspaceSettings.theme = DefaultDark.name;
      }
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: workspaceSettingsPath,
    });
  }

  return new LoadedSettings(
    {
      path: SYSTEM_SETTINGS_PATH,
      settings: systemSettings,
    },
    {
      path: USER_SETTINGS_PATH,
      settings: userSettings,
    },
    {
      path: workspaceSettingsPath,
      settings: workspaceSettings,
    },
    settingsErrors,
  );
}

export function saveSettings(settingsFile: SettingsFile): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(settingsFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(
      settingsFile.path,
      JSON.stringify(settingsFile.settings, null, 2),
      'utf-8',
    );
  } catch (error) {
    console.error('Error saving user settings file:', error);
  }
}
