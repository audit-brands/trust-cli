# Issue #5 Solution: OAuth Settings Migration using Privacy Manager Infrastructure

## Implementation Plan

The privacy manager's configuration management system can be extended to handle OAuth migration:

### 1. Leverage Existing Configuration Infrastructure

The privacy manager already implements:

- **Configuration validation** (`validatePrivacyConfig`)
- **Configuration persistence** (`savePrivacyConfiguration`)
- **Backup system** (`createConfigurationBackup`)
- **Secure file operations** with proper permissions

### 2. Proposed Migration Implementation

```typescript
// Add to packages/cli/src/config/settings.ts
import { PrivacyManager } from '../../core/src/trust/privacyManager.js';

export async function migrateAuthSettings(): Promise<void> {
  const settingsPath = '~/.gemini/settings.json';

  try {
    // Use privacy manager's file system operations
    const configData = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(configData);

    // Check for legacy OAuth setting
    if (settings.selectedAuthType === 'oauth-personal') {
      console.log('🔄 Migrating legacy OAuth configuration to trust-local...');

      // Create backup (using privacy manager pattern)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${settingsPath}.backup-${timestamp}`;
      await fs.copyFile(settingsPath, backupPath);

      // Update settings
      settings.selectedAuthType = 'trust-local';

      // Save with secure permissions (privacy manager pattern)
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      await fs.chmod(settingsPath, 0o600);

      console.log('✅ Successfully migrated to trust-local authentication');
      console.log(`📁 Backup saved: ${backupPath}`);
    }
  } catch (error) {
    console.warn('⚠️ Failed to migrate auth settings:', error);
  }
}
```

### 3. Integration Points

1. **Startup Check** - Add to `packages/cli/src/gemini.tsx`:

```typescript
// During initialization
await migrateAuthSettings();
```

2. **CLI Command** - Add migration command:

```bash
trust config migrate
```

3. **Audit Logging** - Use privacy manager's audit system:

```typescript
await privacyManager.logAuditEntry({
  operation: 'auth_settings_migrated',
  dataType: 'configuration',
  sanitized: false,
  details: { fromAuth: 'oauth-personal', toAuth: 'trust-local' },
});
```

## Benefits of Using Privacy Manager Infrastructure

1. **Consistent patterns**: Uses same file operation patterns as privacy config
2. **Security**: Secure file permissions and backup creation
3. **Audit trail**: Configuration changes are logged
4. **Error handling**: Robust error handling patterns already established
5. **Validation**: Configuration validation framework already exists

## Implementation Effort: Low

- Reuse existing privacy manager file system operations
- Extend configuration validation framework
- Add migration logic to startup sequence
