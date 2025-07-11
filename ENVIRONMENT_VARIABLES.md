# Environment Variables

Trust CLI supports several environment variables to customize its behavior:

## DEBUG

Controls debug output and logging.

**Usage:**
```bash
DEBUG=1 trust [command]
DEBUG=true trust [command]
DEBUG=verbose trust [command]
```

**Examples:**
```bash
# Enable debug mode
DEBUG=1 trust --help

# Run with verbose debugging
DEBUG=verbose trust "What is the weather today?"
```

**Note:** This environment variable works in addition to the `--debug` CLI flag.

## CLI_TITLE

Customize the CLI title/branding displayed in the header.

**Usage:**
```bash
CLI_TITLE="My Custom Title" trust [command]
```

**Examples:**
```bash
# Simple text title
CLI_TITLE="My AI Assistant" trust

# Custom branding
CLI_TITLE="Corporate AI Tool v2.0" trust
```

**Note:** This environment variable takes precedence over both the default ASCII art and any custom ASCII art set in settings.

## Configuration Priority

Environment variables are processed in the following priority order:

1. **CLI_TITLE** environment variable (highest priority)
2. `customCliTitle` setting in settings.json
3. Default Trust CLI ASCII art (lowest priority)

For debug mode:
1. `--debug` CLI flag
2. **DEBUG** environment variable
3. Default debug mode (disabled)

## Settings Integration

You can also set these preferences permanently in your settings file:

```json
{
  "customCliTitle": "My Custom CLI Title"
}
```

The settings file is located at `~/.gemini/settings.json`.

## Context Compression Settings

Trust CLI now supports intelligent context compression that preserves recent conversation history:

```json
{
  "contextCompression": {
    "preserveRecentTurns": 6
  }
}
```

**How it works:**
- When conversations grow too large, Trust CLI compresses older history while preserving recent exchanges
- Default: 6 recent turns (3 complete user-assistant exchanges) are preserved
- Older history is compressed into a structured summary
- Recent history maintains conversational flow and context

**Benefits:**
- Better conversation continuity
- Maintains recent context for follow-up questions
- Reduces token usage while preserving important information
- Configurable based on your needs

**Configuration:**
- `preserveRecentTurns`: Number of recent conversation turns to preserve (default: 6)
- Set to 0 to disable recent history preservation (classic compression)
- Higher values preserve more recent context but use more tokens