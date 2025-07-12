# Ollama Usage Patterns and Best Practices

> **Practical Guide**  
> Real-world usage patterns, optimization strategies, and best practices for Trust CLI's Ollama integration

## Table of Contents

1. [Common Usage Patterns](#common-usage-patterns)
2. [Development Workflows](#development-workflows)
3. [Performance Optimization](#performance-optimization)
4. [Production Deployment](#production-deployment)
5. [Monitoring and Maintenance](#monitoring-and-maintenance)
6. [Best Practices](#best-practices)
7. [Example Implementations](#example-implementations)

## Common Usage Patterns

### 1. Code Analysis and Review

#### Pattern: Automated Code Review

```bash
# Analyze a single file
trust "Review this TypeScript file for potential issues" < src/components/UserProfile.tsx

# Batch analysis of multiple files
find src/ -name "*.ts" -exec trust "Analyze this file for security vulnerabilities: {}" \;

# Review pull request changes
git diff main..feature-branch | trust "Review these code changes for best practices"
```

#### Pattern: Architecture Documentation

```bash
# Generate architecture overview
trust "Analyze the project structure and create an architecture diagram" \
  --tools read_file,list_directory,shell_command

# Document API endpoints
trust "Document all API endpoints in this Express.js application" \
  --include-files "src/routes/*.ts"

# Create component documentation
trust "Generate documentation for all React components" \
  --directory src/components/
```

### 2. Development Assistance

#### Pattern: Interactive Development

```bash
# Start interactive session for development
trust interactive --model qwen2.5:3b

# In interactive mode:
> Explain this error message: [paste error]
> Suggest fixes for this failing test
> Help me optimize this database query
> /tools list  # Show available tools
> /backend ollama  # Ensure using local model
```

#### Pattern: Test Generation

```bash
# Generate unit tests
trust "Create comprehensive unit tests for this utility function" < utils/dateHelper.js

# Generate integration tests
trust "Create integration tests for this API endpoint" \
  --context "Express.js app with MongoDB"

# Generate test data
trust "Generate realistic test data for user profiles" \
  --format json --count 50
```

### 3. Documentation Generation

#### Pattern: API Documentation

```bash
# Generate OpenAPI specification
trust "Create OpenAPI spec from these route handlers" \
  --files src/routes/*.ts \
  --format yaml

# Generate README sections
trust "Create usage examples for this CLI tool" \
  --context "Node.js command-line application"

# Generate change logs
git log --oneline --since="1 month ago" | \
  trust "Create a changelog from these commits"
```

#### Pattern: Technical Writing

```bash
# Generate architectural decision records
trust "Create an ADR for migrating from REST to GraphQL" \
  --template adr

# Create troubleshooting guides
trust "Generate troubleshooting guide for common deployment issues" \
  --context "Kubernetes deployment"

# Generate user guides
trust "Create user guide for this React component library" \
  --include-examples
```

### 4. Data Processing and Analysis

#### Pattern: Log Analysis

```bash
# Analyze application logs
trust "Analyze these logs for error patterns" < logs/application.log

# Process server metrics
trust "Summarize these performance metrics and identify bottlenecks" \
  --files monitoring/*.json

# Security audit
trust "Review these access logs for suspicious activity" \
  --context "Web server access logs"
```

#### Pattern: Configuration Management

```bash
# Validate configurations
trust "Check this Kubernetes YAML for best practices" < k8s/deployment.yaml

# Generate configurations
trust "Create Nginx config for load balancing these services" \
  --services "api-1:3000,api-2:3000,api-3:3000"

# Environment setup
trust "Generate Docker Compose file for this development environment" \
  --context "React frontend, Node.js backend, PostgreSQL database"
```

## Development Workflows

### 1. Local Development Setup

#### Pattern: Project Initialization

```bash
#!/bin/bash
# setup-ollama-dev.sh

# Start Ollama service
ollama serve &

# Pull required models
ollama pull qwen2.5:1.5b  # Fast model for quick tasks
ollama pull qwen2.5:3b    # Balanced model for most tasks
ollama pull qwen2.5:7b    # Capable model for complex tasks

# Configure Trust CLI
trust config set ai.backends.ollama.enabled true
trust config set ai.fallback.enabled true
trust config set ai.fallback.order '["ollama", "huggingface", "cloud"]'

# Verify setup
trust health --ollama
trust test "Hello, Ollama!" --backend ollama

echo "✅ Ollama development environment ready!"
```

#### Pattern: IDE Integration

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Trust: Analyze Current File",
      "type": "shell",
      "command": "trust",
      "args": [
        "Analyze this file for potential improvements",
        "--file",
        "${file}",
        "--backend",
        "ollama"
      ],
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false
      }
    },
    {
      "label": "Trust: Generate Tests",
      "type": "shell",
      "command": "trust",
      "args": [
        "Generate unit tests for this file",
        "--file",
        "${file}",
        "--backend",
        "ollama",
        "--output",
        "${fileDirname}/${fileBasenameNoExtension}.test.${fileExtname}"
      ]
    }
  ]
}
```

### 2. Continuous Integration Patterns

#### Pattern: CI/CD Integration

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review

on:
  pull_request:
    branches: [main]

jobs:
  ai-review:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Ollama
        run: |
          curl -fsSL https://ollama.ai/install.sh | sh
          ollama serve &
          sleep 10
          ollama pull qwen2.5:1.5b

      - name: Install Trust CLI
        run: npm install -g @trust-cli/cli

      - name: AI Code Review
        run: |
          git diff origin/main..HEAD > changes.diff
          trust "Review these changes for security, performance, and best practices" \
            --input changes.diff \
            --backend ollama \
            --format markdown > ai-review.md

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('ai-review.md', 'utf8');

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## AI Code Review\n\n${review}`
            });
```

### 3. Development Automation

#### Pattern: Git Hooks Integration

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Run AI-powered pre-commit checks
echo "🤖 Running AI-powered pre-commit checks..."

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|tsx?)$')

if [ -z "$STAGED_FILES" ]; then
  echo "No JavaScript/TypeScript files to check."
  exit 0
fi

# Check each staged file
for FILE in $STAGED_FILES; do
  echo "Checking $FILE..."

  # Run AI analysis
  RESULT=$(trust "Quick code review for potential issues" \
    --file "$FILE" \
    --backend ollama \
    --timeout 30 \
    --format json)

  # Parse result and check for critical issues
  CRITICAL=$(echo "$RESULT" | jq -r '.criticalIssues // 0')

  if [ "$CRITICAL" -gt 0 ]; then
    echo "❌ Critical issues found in $FILE"
    echo "$RESULT" | jq -r '.issues[]'
    exit 1
  fi
done

echo "✅ All checks passed!"
exit 0
```

## Performance Optimization

### 1. Model Selection Strategies

#### Pattern: Dynamic Model Selection

```typescript
class SmartModelSelector {
  private readonly modelCapabilities = {
    'qwen2.5:1.5b': {
      maxComplexity: 3,
      speedScore: 10,
      memoryUsage: 2048,
      bestFor: ['simple_queries', 'quick_analysis', 'basic_coding'],
    },
    'qwen2.5:3b': {
      maxComplexity: 7,
      speedScore: 7,
      memoryUsage: 4096,
      bestFor: ['code_review', 'documentation', 'complex_analysis'],
    },
    'qwen2.5:7b': {
      maxComplexity: 10,
      speedScore: 4,
      memoryUsage: 8192,
      bestFor: ['architecture_design', 'complex_reasoning', 'research'],
    },
  };

  selectModel(prompt: string, context: TaskContext): string {
    const complexity = this.analyzeComplexity(prompt, context);
    const urgency = context.urgency || 'normal';
    const availableMemory = context.availableMemory || 8192;

    if (urgency === 'high' && complexity <= 3) {
      return 'qwen2.5:1.5b'; // Fast response
    }

    const suitableModels = Object.entries(this.modelCapabilities)
      .filter(
        ([_, caps]) =>
          caps.maxComplexity >= complexity &&
          caps.memoryUsage <= availableMemory,
      )
      .sort((a, b) => {
        if (urgency === 'high') {
          return b[1].speedScore - a[1].speedScore; // Prefer speed
        }
        return b[1].maxComplexity - a[1].maxComplexity; // Prefer capability
      });

    return suitableModels[0]?.[0] || 'qwen2.5:1.5b';
  }

  private analyzeComplexity(prompt: string, context: TaskContext): number {
    let complexity = 1;

    // Analyze prompt characteristics
    if (prompt.length > 500) complexity += 1;
    if (prompt.includes('analyze') || prompt.includes('review'))
      complexity += 2;
    if (prompt.includes('architecture') || prompt.includes('design'))
      complexity += 3;
    if (context.files && context.files.length > 5) complexity += 2;
    if (context.tools && context.tools.length > 3) complexity += 1;

    return Math.min(complexity, 10);
  }
}
```

#### Pattern: Resource-Aware Configuration

```typescript
interface ResourceConfig {
  totalRAM: number;
  availableCores: number;
  diskSpace: number;
  networkSpeed: number;
}

class ResourceOptimizer {
  optimizeForHardware(resources: ResourceConfig): OllamaConfig {
    const config: OllamaConfig = {
      baseUrl: 'http://localhost:11434/v1',
      timeout: 60000,
      keepAlive: '5m',
    };

    // Adjust concurrency based on available cores
    config.concurrency = Math.max(1, Math.floor(resources.availableCores / 2));

    // Select model based on available RAM
    if (resources.totalRAM >= 16384) {
      // 16GB+
      config.model = 'qwen2.5:7b';
      config.keepAlive = '15m'; // Keep larger models loaded longer
    } else if (resources.totalRAM >= 8192) {
      // 8GB+
      config.model = 'qwen2.5:3b';
      config.keepAlive = '10m';
    } else {
      config.model = 'qwen2.5:1.5b';
      config.keepAlive = '5m';
    }

    // Adjust timeout based on hardware
    if (resources.availableCores < 4) {
      config.timeout = 120000; // Longer timeout for slower hardware
    }

    return config;
  }
}
```

### 2. Caching Strategies

#### Pattern: Response Caching

```typescript
interface CacheEntry {
  response: string;
  timestamp: number;
  ttl: number;
  hash: string;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 3600000; // 1 hour

  async get(prompt: string, context?: any): Promise<string | null> {
    const key = this.generateKey(prompt, context);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  async set(
    prompt: string,
    response: string,
    context?: any,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<void> {
    const key = this.generateKey(prompt, context);

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      ttl,
      hash: key,
    });

    // Cleanup old entries periodically
    if (this.cache.size > 1000) {
      this.cleanup();
    }
  }

  private generateKey(prompt: string, context?: any): string {
    const crypto = require('crypto');
    const data = JSON.stringify({ prompt, context: context || {} });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 3. Connection Optimization

#### Pattern: Connection Pooling

```typescript
class ConnectionPool {
  private connections: Connection[] = [];
  private readonly maxSize: number;
  private readonly minSize: number;
  private activeConnections = 0;

  constructor(config: { maxSize: number; minSize: number }) {
    this.maxSize = config.maxSize;
    this.minSize = config.minSize;

    // Pre-warm connections
    this.preWarmConnections();
  }

  async acquire(): Promise<Connection> {
    // Try to get an existing connection
    const connection = this.connections.pop();

    if (connection && (await this.validateConnection(connection))) {
      this.activeConnections++;
      return connection;
    }

    // Create new connection if under limit
    if (this.activeConnections < this.maxSize) {
      const newConnection = await this.createConnection();
      this.activeConnections++;
      return newConnection;
    }

    // Wait for available connection
    return this.waitForConnection();
  }

  async release(connection: Connection): Promise<void> {
    this.activeConnections--;

    if (await this.validateConnection(connection)) {
      this.connections.push(connection);
    } else {
      await this.destroyConnection(connection);
    }

    // Maintain minimum pool size
    if (this.connections.length < this.minSize) {
      this.preWarmConnections();
    }
  }

  private async preWarmConnections(): Promise<void> {
    const needed = this.minSize - this.connections.length;

    const promises = Array(needed)
      .fill(null)
      .map(() =>
        this.createConnection()
          .then((conn) => {
            this.connections.push(conn);
          })
          .catch((error) => {
            console.warn('Failed to pre-warm connection:', error);
          }),
      );

    await Promise.allSettled(promises);
  }
}
```

## Production Deployment

### 1. Docker Deployment

#### Pattern: Multi-Stage Docker Build

```dockerfile
# Dockerfile.ollama-trust
FROM ollama/ollama:latest as ollama-base

# Install Trust CLI
FROM node:18-alpine as trust-cli
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production image
FROM ollama/ollama:latest
LABEL maintainer="trust-cli-team"

# Install Node.js for Trust CLI
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Trust CLI
COPY --from=trust-cli /app/node_modules ./node_modules
COPY --from=trust-cli /app/package*.json ./
COPY src/ ./src/

# Setup scripts
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:11434/api/tags || exit 1

EXPOSE 11434 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["serve"]
```

#### Pattern: Docker Compose for Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  ollama:
    build:
      context: .
      dockerfile: Dockerfile.ollama-trust
    ports:
      - '11434:11434'
      - '8080:8080'
    volumes:
      - ollama_data:/root/.ollama
      - ./models:/models
    environment:
      - OLLAMA_HOST=0.0.0.0
      - TRUST_OLLAMA_ENABLED=true
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:11434/api/tags']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  trust-api:
    depends_on:
      - ollama
    build:
      context: .
      dockerfile: Dockerfile.trust-api
    ports:
      - '3000:3000'
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434/v1
      - TRUST_API_PORT=3000
      - NODE_ENV=production
    volumes:
      - ./config:/app/config

volumes:
  ollama_data:
    driver: local
```

### 2. Kubernetes Deployment

#### Pattern: Kubernetes Manifests

```yaml
# k8s/ollama-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama-trust
  labels:
    app: ollama-trust
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ollama-trust
  template:
    metadata:
      labels:
        app: ollama-trust
    spec:
      containers:
        - name: ollama
          image: ollama/ollama:latest
          ports:
            - containerPort: 11434
          resources:
            requests:
              memory: '4Gi'
              cpu: '1'
            limits:
              memory: '8Gi'
              cpu: '2'
          volumeMounts:
            - name: models-storage
              mountPath: /root/.ollama
          livenessProbe:
            httpGet:
              path: /api/tags
              port: 11434
            initialDelaySeconds: 30
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /api/tags
              port: 11434
            initialDelaySeconds: 10
            periodSeconds: 5

        - name: trust-api
          image: trust-cli/api:latest
          ports:
            - containerPort: 8080
          env:
            - name: OLLAMA_BASE_URL
              value: 'http://localhost:11434/v1'
            - name: TRUST_API_PORT
              value: '8080'
          resources:
            requests:
              memory: '512Mi'
              cpu: '0.5'
            limits:
              memory: '1Gi'
              cpu: '1'

      volumes:
        - name: models-storage
          persistentVolumeClaim:
            claimName: ollama-models-pvc

---
apiVersion: v1
kind: Service
metadata:
  name: ollama-trust-service
spec:
  selector:
    app: ollama-trust
  ports:
    - name: ollama
      protocol: TCP
      port: 11434
      targetPort: 11434
    - name: api
      protocol: TCP
      port: 8080
      targetPort: 8080
  type: LoadBalancer
```

### 3. Production Configuration

#### Pattern: Environment-Specific Configuration

```yaml
# config/production.yaml
api:
  port: ${PORT:-8080}
  host: ${HOST:-0.0.0.0}
  cors:
    enabled: true
    origins: ${CORS_ORIGINS}

  rateLimit:
    requests: ${RATE_LIMIT_REQUESTS:-100}
    window: ${RATE_LIMIT_WINDOW:-60000}

  authentication:
    enabled: ${AUTH_ENABLED:-true}
    provider: ${AUTH_PROVIDER:-jwt}
    secret: ${JWT_SECRET}

ollama:
  baseUrl: ${OLLAMA_BASE_URL:-http://localhost:11434/v1}
  timeout: ${OLLAMA_TIMEOUT:-60000}
  concurrency: ${OLLAMA_CONCURRENCY:-4}
  keepAlive: ${OLLAMA_KEEP_ALIVE:-10m}

  models:
    default: ${DEFAULT_MODEL:-qwen2.5:3b}
    available:
      - qwen2.5:1.5b
      - qwen2.5:3b
      - qwen2.5:7b

  fallback:
    enabled: ${FALLBACK_ENABLED:-true}
    timeout: ${FALLBACK_TIMEOUT:-30000}
    order: ${FALLBACK_ORDER:-["ollama", "huggingface", "cloud"]}

monitoring:
  enabled: ${MONITORING_ENABLED:-true}
  metricsPort: ${METRICS_PORT:-9090}
  healthCheckPath: ${HEALTH_CHECK_PATH:-/health}

  logging:
    level: ${LOG_LEVEL:-info}
    format: ${LOG_FORMAT:-json}
    destination: ${LOG_DESTINATION:-stdout}

security:
  requestValidation:
    enabled: true
    maxPromptLength: ${MAX_PROMPT_LENGTH:-10000}
    sanitizeInput: true

  rateLimiting:
    enabled: true
    perUser: ${RATE_LIMIT_PER_USER:-10}
    perIP: ${RATE_LIMIT_PER_IP:-100}
```

## Monitoring and Maintenance

### 1. Health Monitoring

#### Pattern: Comprehensive Health Checks

```typescript
class HealthMonitor {
  private checks: HealthCheck[] = [
    {
      name: 'ollama-connection',
      check: this.checkOllamaConnection.bind(this),
      interval: 30000,
      timeout: 5000,
      critical: true,
    },
    {
      name: 'model-availability',
      check: this.checkModelAvailability.bind(this),
      interval: 60000,
      timeout: 10000,
      critical: true,
    },
    {
      name: 'memory-usage',
      check: this.checkMemoryUsage.bind(this),
      interval: 15000,
      timeout: 1000,
      critical: false,
    },
    {
      name: 'response-time',
      check: this.checkResponseTime.bind(this),
      interval: 120000,
      timeout: 30000,
      critical: false,
    },
  ];

  async checkOllamaConnection(): Promise<HealthResult> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        timeout: 5000,
      });

      if (response.ok) {
        return {
          healthy: true,
          message: 'Ollama service is responsive',
          timestamp: Date.now(),
        };
      } else {
        return {
          healthy: false,
          message: `Ollama returned status ${response.status}`,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: `Failed to connect to Ollama: ${error.message}`,
        timestamp: Date.now(),
      };
    }
  }

  async checkModelAvailability(): Promise<HealthResult> {
    try {
      const response = await this.ollamaClient.listModels();
      const requiredModels = ['qwen2.5:1.5b', 'qwen2.5:3b'];
      const availableModels = response.models.map((m) => m.name);

      const missingModels = requiredModels.filter(
        (model) => !availableModels.includes(model),
      );

      if (missingModels.length === 0) {
        return {
          healthy: true,
          message: 'All required models are available',
          details: { availableModels },
          timestamp: Date.now(),
        };
      } else {
        return {
          healthy: false,
          message: `Missing required models: ${missingModels.join(', ')}`,
          details: { availableModels, missingModels },
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      return {
        healthy: false,
        message: `Failed to check model availability: ${error.message}`,
        timestamp: Date.now(),
      };
    }
  }
}
```

### 2. Performance Monitoring

#### Pattern: Metrics Collection

```typescript
class MetricsCollector {
  private prometheus = require('prom-client');

  private metrics = {
    requestsTotal: new this.prometheus.Counter({
      name: 'ollama_requests_total',
      help: 'Total number of requests to Ollama',
      labelNames: ['model', 'status', 'endpoint'],
    }),

    requestDuration: new this.prometheus.Histogram({
      name: 'ollama_request_duration_seconds',
      help: 'Duration of Ollama requests',
      labelNames: ['model', 'endpoint'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    }),

    modelMemoryUsage: new this.prometheus.Gauge({
      name: 'ollama_model_memory_bytes',
      help: 'Memory usage of loaded models',
      labelNames: ['model'],
    }),

    activeConnections: new this.prometheus.Gauge({
      name: 'ollama_active_connections',
      help: 'Number of active connections to Ollama',
    }),
  };

  recordRequest(model: string, endpoint: string, status: string): void {
    this.metrics.requestsTotal.labels(model, status, endpoint).inc();
  }

  recordRequestDuration(
    model: string,
    endpoint: string,
    duration: number,
  ): void {
    this.metrics.requestDuration.labels(model, endpoint).observe(duration);
  }

  updateModelMemoryUsage(model: string, memoryBytes: number): void {
    this.metrics.modelMemoryUsage.labels(model).set(memoryBytes);
  }

  updateActiveConnections(count: number): void {
    this.metrics.activeConnections.set(count);
  }

  getMetrics(): string {
    return this.prometheus.register.metrics();
  }
}
```

### 3. Automated Maintenance

#### Pattern: Model Update Automation

```bash
#!/bin/bash
# scripts/update-models.sh

set -e

MODELS=(
  "qwen2.5:1.5b"
  "qwen2.5:3b"
  "qwen2.5:7b"
)

LOG_FILE="/var/log/ollama-updates.log"
NOTIFICATION_URL="${SLACK_WEBHOOK_URL}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

notify() {
  if [ -n "$NOTIFICATION_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"$1\"}" \
      "$NOTIFICATION_URL"
  fi
}

check_model_updates() {
  local model="$1"
  local current_digest
  local latest_digest

  log "Checking updates for model: $model"

  # Get current model digest
  current_digest=$(ollama show "$model" --modelfile | grep -E '^FROM' | awk '{print $2}' | cut -d: -f2)

  # Pull latest and get digest
  ollama pull "$model" > /dev/null 2>&1
  latest_digest=$(ollama show "$model" --modelfile | grep -E '^FROM' | awk '{print $2}' | cut -d: -f2)

  if [ "$current_digest" != "$latest_digest" ]; then
    log "Model $model updated from $current_digest to $latest_digest"
    return 0
  else
    log "Model $model is up to date"
    return 1
  fi
}

main() {
  log "Starting model update check"

  updated_models=()

  for model in "${MODELS[@]}"; do
    if check_model_updates "$model"; then
      updated_models+=("$model")
    fi
  done

  if [ ${#updated_models[@]} -gt 0 ]; then
    message="Models updated: ${updated_models[*]}"
    log "$message"
    notify "$message"

    # Restart Trust CLI services if running in production
    if systemctl is-active --quiet trust-cli; then
      log "Restarting Trust CLI service"
      systemctl restart trust-cli
    fi
  else
    log "No model updates available"
  fi

  log "Model update check completed"
}

main "$@"
```

## Best Practices

### 1. Configuration Management

- **Environment-specific configs**: Use separate configurations for dev/staging/prod
- **Secret management**: Store sensitive data in environment variables or secret managers
- **Configuration validation**: Validate configuration on startup
- **Hot reloading**: Support runtime configuration updates where possible

### 2. Resource Management

- **Memory monitoring**: Monitor model memory usage and set appropriate limits
- **Connection pooling**: Use connection pools to manage concurrent requests
- **Request queuing**: Implement request queuing for burst traffic
- **Graceful degradation**: Provide fallback options when resources are constrained

### 3. Error Handling

- **Retry strategies**: Implement exponential backoff for transient failures
- **Circuit breakers**: Prevent cascading failures with circuit breaker patterns
- **Timeout management**: Set appropriate timeouts for different operations
- **Error classification**: Categorize errors for appropriate handling

### 4. Security

- **Input validation**: Sanitize all user inputs
- **Rate limiting**: Implement per-user and per-IP rate limiting
- **Authentication**: Use strong authentication mechanisms
- **Audit logging**: Log all security-relevant events

### 5. Monitoring

- **Health checks**: Implement comprehensive health checking
- **Metrics collection**: Collect and expose relevant metrics
- **Alerting**: Set up alerts for critical issues
- **Log aggregation**: Centralize logs for analysis

### 6. Documentation

- **API documentation**: Maintain up-to-date API documentation
- **Runbooks**: Create operational runbooks for common scenarios
- **Architecture docs**: Document system architecture and design decisions
- **Troubleshooting guides**: Provide clear troubleshooting instructions

---

This comprehensive guide provides practical patterns and examples for effectively using Trust CLI's Ollama integration in real-world scenarios. It covers everything from basic usage to advanced production deployment patterns.
