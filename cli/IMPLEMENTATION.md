# MCP Agent CLI Implementation Summary

This document describes the implementation of the Gentoro MCP Agent CLI, a TypeScript-based command-line interface that manages the entire MCP Agent stack without requiring Docker.

## Overview

The CLI provides a complete, local alternative to Docker-based deployment, managing all required services (Java app, TypeScript runtime, OTEL collector, and optional mock server) as native processes with full lifecycle management.

## Architecture

### Components

```
cli/
├── src/
│   ├── index.ts                    # Main CLI entry point with all commands
│   ├── types.ts                    # TypeScript type definitions
│   ├── config/
│   │   ├── manager.ts              # Configuration management (YAML files)
│   │   └── paths.ts                # Path management and directory structure
│   ├── services/
│   │   ├── process-manager.ts      # Generic process lifecycle manager
│   │   └── agent-service.ts        # MCP Agent service orchestration
│   ├── wizard/
│   │   └── setup.ts                # Interactive first-time setup wizard
│   ├── chat/
│   │   └── chat-mode.ts            # Interactive chat with AI integration
│   └── handbook/
│       └── manager.ts              # Handbook creation and validation
├── package.json                     # Dependencies and scripts
├── tsconfig.json                    # TypeScript configuration
├── install.sh                       # Installation script
└── README.md                        # Complete documentation
```

### Service Management

The CLI manages four services with dependency resolution:

1. **OpenTelemetry Collector** (Priority 10)
   - Port: 4317 (GRPC), 4318 (HTTP)
   - Optional for telemetry collection
   - Falls back gracefully if not available

2. **TypeScript Runtime** (Priority 20)
   - Port: 7070
   - Executes TypeScript snippets in isolated environment
   - Health check: `http://localhost:7070/health`

3. **MCP Agent** (Priority 30)
   - Port: 8080 (configurable)
   - Main Spring Boot application
   - Depends on: TypeScript Runtime
   - Health check: `http://localhost:8080/actuator/health`

4. **Mock Server** (Priority 40, Optional)
   - Port: 8082
   - Acme Analytics mock service
   - Only runs in mock mode

## Key Features

### 1. Interactive Setup Wizard

**File:** `src/wizard/setup.ts`

- First-time configuration wizard
- Provider selection (OpenAI, Gemini, Anthropic)
- API key management
- Mode selection (mock vs real API)
- Handbook directory creation
- Service authentication setup

**Flow:**
```
Start → Select Provider → Enter API Key → 
Choose Mode → [If Own API: Configure Service] → 
Save Configuration → Show Next Steps
```

### 2. Process Management

**File:** `src/services/process-manager.ts`

Features:
- Generic process spawning and management
- Dependency resolution (services start in order)
- Health checking with configurable endpoints
- Automatic log capture to files
- PID file management
- Graceful shutdown with timeout
- Process restart capabilities

**Key Methods:**
```typescript
register(config: ProcessConfig): void
start(name: string): Promise<void>
stop(name: string, force?: boolean): Promise<void>
isRunning(name: string): boolean
getStatus(name: string): Promise<ServiceStatus>
getLogs(name: string, lines: number): Promise<string>
```

### 3. Configuration Management

**File:** `src/config/manager.ts`

Handles two types of configuration:

**Global Config** (`~/.mcpagent/config.yaml`):
```yaml
provider: openai
apiKey: sk-...
defaultPort: 8080
handbookDir: ~/handbooks
logDir: ~/.mcpagent/logs
```

**Service Config** (`~/.mcpagent/services/{service}.yaml`):
```yaml
service: my-api
baseUrl: https://api.example.com
header: Authorization
pattern: Bearer {token}
token: eyJh...
expiresAt: 2025-10-25T14:02:12Z
```

### 4. Handbook Management

**File:** `src/handbook/manager.ts`

Creates and validates handbook directories with required structure:

```
handbook/
├── Agent.md              # Required: Agent instructions
├── apis/                 # Recommended: OpenAPI specs
├── docs/                 # Recommended: Documentation
├── config/               # Configuration files
├── regression/           # Optional: Test definitions
└── state/                # Auto-generated: Runtime state
```

Validation includes:
- File existence checks
- Directory structure validation
- OpenAPI spec detection
- Documentation presence
- Warning and error reporting

### 5. Chat Mode

**File:** `src/chat/chat-mode.ts`

Interactive chat with AI models using MCP tools:

Features:
- Real-time conversation with AI
- Automatic MCP tool discovery
- Function calling support (OpenAI)
- Chat history management
- Special commands (help, clear, exit)

**Flow:**
```
Check Agent Status → Get MCP Tools → 
User Input → Send to AI Provider → 
Handle Tool Calls → Display Response → Loop
```

Currently fully implemented for OpenAI with placeholders for Gemini and Anthropic.

### 6. Authentication Management

**Files:** 
- `src/config/manager.ts` (storage)
- `src/index.ts` (CLI commands)

Features:
- Service authentication configuration
- Token storage and management
- Token renewal workflow
- Expiration tracking
- Multiple service support

**Commands:**
```bash
mcpagent service auth <name>    # Configure authentication
mcpagent service renew <name>   # Renew token
mcpagent service list           # List services
```

## CLI Commands

### Core Commands

```typescript
mcpagent                    # Run setup wizard if needed, else show status
mcpagent start [options]    # Start all services
mcpagent stop               # Stop all services
mcpagent status             # Show service status
mcpagent chat               # Open interactive chat
mcpagent logs [service]     # View logs
```

### Management Commands

```typescript
mcpagent service auth <name>        # Configure service
mcpagent service renew <name>       # Renew token
mcpagent service list               # List services
mcpagent handbook init <name>       # Create handbook
mcpagent handbook validate [dir]    # Validate handbook
mcpagent handbook list              # List handbooks
mcpagent provider set               # Set provider
mcpagent provider switch            # Switch provider
mcpagent doctor                     # System diagnostics
```

## Configuration Locations

All CLI data is stored in `~/.mcpagent/`:

```
~/.mcpagent/
├── config.yaml              # Global configuration
├── services/                # Service configurations
│   ├── service1.yaml
│   └── service2.yaml
├── logs/                    # Service logs
│   ├── app.log
│   ├── ts-runtime.log
│   ├── otel.log
│   ├── mock.log
│   └── archive/            # Archived logs
├── state/                   # Runtime state
│   ├── app.pid
│   ├── ts-runtime.pid
│   └── *.sock
└── cache/                   # Cached data
```

Handbooks are stored in `~/handbooks/` by default (configurable).

## Dependencies

### Runtime Dependencies

```json
{
  "chalk": "^5.3.0",           // Terminal colors
  "commander": "^12.1.0",      // CLI framework
  "inquirer": "^9.2.23",       // Interactive prompts
  "yaml": "^2.4.5",            // YAML parsing
  "ora": "^8.0.1",             // Spinners
  "axios": "^1.7.2",           // HTTP client
  "execa": "^8.0.1",           // Process execution
  "fs-extra": "^11.2.0",       // File system utilities
  "log-symbols": "^6.0.0",     // Log symbols
  "boxen": "^7.1.1",           // Terminal boxes
  "tree-kill": "^1.2.2"        // Process tree killing
}
```

### System Requirements

- **Node.js** >= 20 (for ES modules and modern features)
- **Java** 21 (to run MCP Agent)
- **Maven** (to build MCP Agent)
- **OpenTelemetry Collector** (optional, for telemetry)

## Build and Installation

### Development

```bash
cd cli
npm install
npm run build
npm link
```

### Production

```bash
# Via install script
curl -sSL https://gentoro.com/mcpagent | bash

# Via npm (when published)
npm install -g @gentoro/mcpagent-cli
```

## Error Handling

### Strategy

1. **Validation before action** - Check requirements before executing
2. **Graceful degradation** - Optional features fail gracefully
3. **Clear error messages** - User-friendly error descriptions
4. **Recovery suggestions** - Provide next steps on failure

### Examples

```typescript
// Service not running
if (!status.running) {
  console.log(chalk.red('❌ MCP Agent is not running.'));
  console.log(chalk.yellow('Start the agent first with: mcpagent start'));
  return;
}

// Missing dependency
if (!checks.find(c => c.name === 'Java')?.pass) {
  console.log(chalk.dim('  - Java 21: https://adoptium.net/'));
}

// Configuration issue
if (result.errors.length > 0) {
  console.log(chalk.red.bold('Errors:'));
  result.errors.forEach(err => console.log(chalk.red(`  ✗ ${err}`)));
}
```

## Testing Strategy

### Manual Testing

```bash
# Test setup wizard
rm -rf ~/.mcpagent
mcpagent

# Test service management
mcpagent start --mock
mcpagent status
mcpagent logs app
mcpagent stop

# Test handbook management
mcpagent handbook init test-handbook
mcpagent handbook validate test-handbook
mcpagent handbook list

# Test service auth
mcpagent service auth test-service

# Test chat mode
mcpagent start --mock
mcpagent chat
```

### Areas for Automated Testing

Future test coverage should include:
- Configuration management (load/save/validate)
- Process manager (start/stop/status)
- Handbook validation
- Path management
- Service configuration validation

## Limitations and Future Enhancements

### Current Limitations

1. **Chat mode** - Only OpenAI fully implemented
2. **Platform support** - Primarily tested on macOS/Linux
3. **Process monitoring** - Basic health checks only
4. **Error recovery** - Manual intervention required for some failures

### Future Enhancements

1. **Auto-recovery** - Automatic service restart on failure
2. **Multi-handbook** - Run multiple agents simultaneously
3. **Web UI** - Browser-based management interface
4. **Cloud deployment** - Deploy to cloud platforms
5. **Plugin system** - Extensible tool and provider support
6. **Advanced telemetry** - Rich monitoring and metrics
7. **Configuration profiles** - Switch between environments
8. **Service discovery** - Automatic service registration
9. **Load balancing** - Multiple agent instances
10. **Container support** - Hybrid Docker/native deployment

## Integration with Existing Docker Setup

The CLI is designed to coexist with Docker deployment:

- **Different use cases**: CLI for dev, Docker for production
- **Shared handbooks**: Both use same handbook format
- **Compatible configs**: Configuration format compatible
- **Migration path**: Easy switch between CLI and Docker

## Documentation

- **README.md** - Complete CLI reference
- **QUICK_START.md** - 5-minute getting started guide
- **IMPLEMENTATION.md** - This file, technical details
- **CHANGELOG.md** - Version history
- **examples/** - Example configurations and handbooks

## Conclusion

The MCP Agent CLI provides a complete, production-ready alternative to Docker deployment. It's designed for:

- **Developers** - Easy local development and testing
- **Users without Docker** - Full functionality without containers
- **Quick trials** - Fast startup and minimal friction
- **Advanced users** - Full control over services and configuration

The implementation follows best practices for CLI tools:
- Clear, consistent command structure
- Interactive wizards for complex tasks
- Comprehensive error handling
- Detailed logging and diagnostics
- Extensible architecture for future enhancements

