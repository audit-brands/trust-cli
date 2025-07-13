/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OllamaApiServer,
  ApiServerConfig,
  TrustConfiguration,
  ToolRegistry,
  Config,
  sessionId,
  AuthType,
} from '@trust-cli/trust-cli-core';

export interface ServeCommandArgs {
  port?: number;
  host?: string;
  cors?: boolean;
  apiKey?: string;
  verbose?: boolean;
  help?: boolean;
}

let currentServer: OllamaApiServer | null = null;

export class ServeCommandHandler {
  private trustConfig: TrustConfiguration;
  private coreConfig: Config;
  private toolRegistry: ToolRegistry;

  constructor() {
    this.trustConfig = new TrustConfiguration();
    this.coreConfig = new Config({
      sessionId,
      targetDir: process.cwd(),
      debugMode: false,
      cwd: process.cwd(),
      model: 'qwen2.5:1.5b',
    });
    this.toolRegistry = new ToolRegistry(this.coreConfig);
  }

  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
    await this.coreConfig.refreshAuth(AuthType.USE_TRUST_LOCAL);
  }

  async handleCommand(args: ServeCommandArgs): Promise<void> {
    if (args.help) {
      this.showHelp();
      return;
    }

    await this.initialize();

    // Configuration for the API server
    const serverConfig: ApiServerConfig = {
      port: args.port || 8080,
      host: args.host || 'localhost',
      cors: args.cors || true, // Enable CORS by default
      apiKey: args.apiKey,
      rateLimit: {
        requests: 60,
        window: 60000, // 1 minute
      },
    };

    // Ollama configuration from Trust settings
    const ollamaConfig = this.trustConfig.getOllamaConfig();

    console.log('🛡️  Trust CLI - OpenAI-compatible API Server');
    console.log('═'.repeat(60));
    console.log(
      `🌐 Starting server on ${serverConfig.host}:${serverConfig.port}`,
    );
    console.log(`🦙 Ollama backend: ${ollamaConfig.baseUrl}`);
    console.log(
      `🔑 API Key: ${serverConfig.apiKey ? '✅ Required' : '❌ Optional'}`,
    );
    console.log(`🌐 CORS: ${serverConfig.cors ? '✅ Enabled' : '❌ Disabled'}`);

    try {
      // Create and start the server
      currentServer = new OllamaApiServer(
        this.coreConfig,
        this.toolRegistry,
        ollamaConfig,
        serverConfig,
      );

      // Set up graceful shutdown
      this.setupGracefulShutdown();

      // Start the server
      await currentServer.start(serverConfig);

      console.log('\n🚀 Server is running! Try these endpoints:');
      console.log(
        `   POST http://${serverConfig.host}:${serverConfig.port}/v1/chat/completions`,
      );
      console.log(
        `   GET  http://${serverConfig.host}:${serverConfig.port}/v1/models`,
      );
      console.log(
        `   GET  http://${serverConfig.host}:${serverConfig.port}/health`,
      );
      console.log(
        `   GET  http://${serverConfig.host}:${serverConfig.port}/status`,
      );

      if (args.verbose) {
        console.log('\n📊 Server Configuration:');
        console.log(
          `   Rate Limit: ${serverConfig.rateLimit?.requests} req/min`,
        );
        console.log(`   Ollama Model: ${ollamaConfig.defaultModel}`);
        console.log(`   Tools Available: ${await this.getToolCount()}`);
      }

      console.log('\n💡 Usage Examples:');
      console.log(
        '   curl -X POST http://localhost:8080/v1/chat/completions \\',
      );
      console.log('     -H "Content-Type: application/json" \\');
      console.log(
        '     -d \'{"model": "qwen2.5:1.5b", "messages": [{"role": "user", "content": "Hello!"}]}\'',
      );

      console.log('\n🛑 Press Ctrl+C to stop the server');

      // Keep the process alive
      await new Promise(() => {}); // This will run until the process is killed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error(`❌ Failed to start server: ${error}`);

      if (
        error instanceof Error &&
        error.message.includes('Ollama is not running')
      ) {
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Start Ollama: ollama serve');
        console.log(
          '   2. Verify Ollama is running: curl http://localhost:11434/api/tags',
        );
        console.log('   3. Download a model: ollama pull qwen2.5:1.5b');
        console.log('   4. Try again: trust serve');
      }

      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const handleShutdown = async (signal: string) => {
      console.log(`\n📥 Received ${signal}, shutting down gracefully...`);

      if (currentServer) {
        try {
          await currentServer.stop();
          console.log('✅ Server stopped successfully');
        } catch (_error) {
          console.error('❌ Error stopping server:', _error);
        }
      }

      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGQUIT', () => handleShutdown('SIGQUIT'));
  }

  private async getToolCount(): Promise<number> {
    try {
      // Get tools from the registry
      const tools = this.toolRegistry.getAllTools();
      return tools.length;
    } catch (_error) {
      return 0;
    }
  }

  private showHelp(): void {
    console.log(`
🛡️  Trust CLI - API Server Command
════════════════════════════════════════════════════════════

DESCRIPTION:
   Starts an OpenAI-compatible API server that proxies requests to local Ollama
   models while providing tool calling capabilities from Trust CLI.

USAGE:
   trust serve [OPTIONS]

OPTIONS:
   --port <number>        Port to listen on (default: 8080)
   --host <string>        Host to bind to (default: localhost)
   --cors                 Enable CORS headers (default: enabled)
   --api-key <string>     Require API key for authentication (optional)
   --verbose, -v          Show detailed configuration and logs
   --help, -h             Show this help message

EXAMPLES:
   trust serve                                    # Start server on localhost:8080
   trust serve --port 3000 --host 0.0.0.0       # Bind to all interfaces on port 3000
   trust serve --api-key secret123 --verbose     # Require API key with verbose output

ENDPOINTS:
   POST /v1/chat/completions     # OpenAI-compatible chat completions
   GET  /v1/models              # List available Ollama models
   GET  /health                 # Server health check
   GET  /status                 # Detailed server status

REQUIREMENTS:
   • Ollama must be running (ollama serve)
   • At least one model downloaded (ollama pull qwen2.5:1.5b)

INTEGRATION:
   This server can be used with any OpenAI-compatible client:
   • OpenAI Python SDK
   • OpenAI Node.js SDK  
   • Curl commands
   • Third-party applications

SECURITY:
   • Rate limiting: 60 requests per minute per endpoint
   • Optional API key authentication
   • CORS enabled for web applications
   • Local-only by default (use --host 0.0.0.0 to expose)
`);
  }
}

export async function handleServeCommand(
  args: ServeCommandArgs,
): Promise<void> {
  const handler = new ServeCommandHandler();
  await handler.handleCommand(args);
}
