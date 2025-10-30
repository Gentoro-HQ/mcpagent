# Gentoro MCP Agent CLI

The Gentoro MCP Agent CLI provides a fast, consistent way to connect your APIs to AI models that support the Model Context Protocol (MCP).

It removes the need to build custom adapters or middleware. You can start with a built-in mock environment or connect your own service with minimal setup.

## Features

- 🚀 **Quick Start**: Interactive setup wizard for first-time users
- 🤖 **Multiple Providers**: Support for OpenAI, Google Gemini, and Anthropic Claude
- 🔧 **Easy Configuration**: Local configuration management
- 💬 **Interactive Chat**: Built-in chat mode for testing your agent
- 📚 **Handbook Management**: Create and manage agent handbooks
- 🔐 **Auth Management**: Handle service authentication and token renewal
- 📊 **Mock Mode**: Test with built-in Acme Analytics service
- 🔍 **Diagnostics**: Built-in doctor command for troubleshooting

## Installation

### One-Command Install

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | bash
```


This automatically:
- Checks system requirements (Node.js 20+, Java 21, Maven)
- Clones the repository to `~/.mcpagent-src`
- Builds the Java application and TypeScript runtime
- Installs the CLI to `~/.local/bin/mcpagent`
- Provides instructions to add to PATH if needed

**For testing with a specific branch:**
```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | \
  MCPAGENT_REPO_BRANCH=your-branch-name \
  bash
```

**Environment variables:**
- `MCPAGENT_REPO_URL` - Git repository URL (default: https://github.com/Gentoro-HQ/mcpagent.git)
- `MCPAGENT_REPO_BRANCH` - Branch name (default: main)

**Note:** If `~/.local/bin` is not in your PATH, add it:
```bash
# For zsh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# For bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

**For local development:**

```bash
git clone https://github.com/Gentoro-HQ/mcpagent.git && cd mcpagent/cli && npm install && npm run build && npm link
```

## Uninstallation

To completely remove MCP Agent CLI:

```bash
curl -sSL https://raw.githubusercontent.com/gentoro/mcpagent/main/cli/uninstall.sh | bash
```

Or if you have the source:

```bash
bash ~/.mcpagent-src/cli/uninstall.sh
```

The uninstall script will:
- Stop all running services
- Remove the CLI command
- Remove source code and binaries (~500MB)
- Prompt before removing configuration and handbooks
- Clean up temporary files

**Manual uninstallation:**

```bash
# Stop services
mcpagent stop

# Remove CLI
rm ~/.local/bin/mcpagent

# Remove source and data
rm -rf ~/.mcpagent-src
rm -rf ~/.mcpagent      # Configuration and logs
rm -rf ~/handbooks      # Your handbooks (optional)
```

## First Run

When you run `mcpagent` for the first time, it launches an interactive setup wizard:

```bash
mcpagent
```

```
╭──────────────────────────────────────╮
│   Gentoro MCP Agent Setup           │
╰──────────────────────────────────────╯

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1 — Choose a model provider:
  1) OpenAI
  2) Google Gemini
  3) Anthropic Claude

Select provider [1-3]: 1
Enter your OpenAI API key: ▋sk-...

✅  Provider configuration saved.

Step 2 — Choose how to start:
  1) Start with mock Acme Analytics (recommended)
  2) Connect your own API service

Select [1-2]: 1
```

## Mock Mode (Default)

Mock mode starts immediately with no authentication or configuration required.

```bash
mcpagent start --mock
```

```
✅  MCP Agent running at http://localhost:8080/mcp
Mock Service: Acme Analytics Server
```

### Acme Analytics

Acme Analytics provides four data entities:
- **Sales** — transactions and totals
- **Products** — categories and pricing
- **Customers** — segments and lifetime value
- **Regions** — geographic performance

Example queries:
```
> Show me electronics sales in California last quarter.
> List top customers by revenue.
> Compare revenue trends by region.
```

## Connecting Your Own API

If you select "Connect your own API service", setup continues interactively.

```
Step 3 — Specify a handbook directory
Handbook directory [default: ./handbook]: ./my-service

Directory not found — create it? [Y/n]: Y
✅  Created handbook at ./my-service/

Step 4 — Configure service authentication
Header name [default: Authorization]: Authorization  
Pattern [default: Bearer {token}]: Bearer {token}  
Access token: ▋eyJh...

✅  Service configuration saved to ./my-service/service.yaml
✅  Handbook initialized
```

## Handbook Directory

Each MCP Agent runs from a handbook directory, which defines everything the agent needs:

```
handbook/
├── Agent.md          # Instructions and behavior
├── apis/             # OpenAPI specifications
├── docs/             # Supplementary markdown docs
├── regression/       # Optional test definitions
└── state/            # Auto-generated runtime data
```

### Creating a Handbook

```bash
# Initialize a new handbook
mcpagent handbook init my-service

# Validate handbook structure
mcpagent handbook validate ./my-service

# List all handbooks
mcpagent handbook list
```

### Example service.yaml

```yaml
service: acme-analytics
header: Authorization
pattern: Bearer {token}
token: eyJh...
expiresAt: 2025-10-25T14:02:12Z
```

## Authentication Model

Each service defines how to construct its authentication header.

| Field | Description | Example |
|-------|-------------|---------|
| `header` | HTTP header name | Authorization |
| `pattern` | Format containing {token} | Bearer {token} |
| `token` | The current access token | eyJh... |

### Token Expiration and Renewal

If a target service returns 401 Unauthorized, the CLI handles it automatically:

```bash
# Manually configure authentication
mcpagent service auth acme

# Renew token only
mcpagent service renew acme

# List configured services
mcpagent service list
```

## CLI Commands

### Core Commands

```bash
# Start the MCP Agent
mcpagent start [options]
  --port <port>           Port to run on (default: 8080)
  --handbook <dir>        Handbook directory
  --mock                  Start with mock server
  --build                 Build project before starting
  --disable <services>    Comma-separated services to disable

# Stop the agent
mcpagent stop

# Show status
mcpagent status

# Open interactive chat
mcpagent chat

# View logs
mcpagent logs [service]
  -n, --lines <count>     Number of lines (default: 50)
  -f, --follow            Follow log output
```

### Service Management

```bash
# Configure service authentication
mcpagent service auth <service-name>

# Renew service token
mcpagent service renew <service-name>

# List configured services
mcpagent service list
```

### Handbook Management

```bash
# Initialize new handbook
mcpagent handbook init <name>
  -d, --dir <directory>   Target directory

# Validate handbook structure
mcpagent handbook validate [directory]

# List all handbooks
mcpagent handbook list
```

### Provider Management

```bash
# Set model provider
mcpagent provider set

# Switch between providers
mcpagent provider switch
```

### Diagnostics

```bash
# Check system requirements
mcpagent doctor

# Show version
mcpagent --version

# Show help
mcpagent --help
```

## Configuration Files

### Global Configuration

Location: `~/.mcpagent/config.yaml`

```yaml
provider: openai
apiKey: sk-...
defaultPort: 8080
handbookDir: ~/handbooks
logDir: ~/.mcpagent/logs
```

### Service Configuration

Location: `~/.mcpagent/services/acme.yaml`

```yaml
service: acme-analytics
header: Authorization
pattern: Bearer {token}
token: eyJh...
```

## Configuration State Detection

The CLI determines how to start based on existing files:

| Condition | Action |
|-----------|--------|
| No config found | Launch setup wizard |
| Service config present | Start in connected mode |
| No service config | Default to mock mode |
| Handbook directory missing | Offer to create one automatically |

This ensures predictable startup behavior for both new and returning users.

## Logs and Diagnostics

Logs are stored in `~/.mcpagent/logs/`:

```
~/.mcpagent/logs/
├── app.log
├── ts-runtime.log
├── otel.log
├── mock.log
└── archive/
```

View logs:

```bash
# Tail logs for specific service
mcpagent logs app -n 100

# View all logs
mcpagent logs

# Check system health
mcpagent doctor
```

## Example Workflows

### Mock Mode

```bash
# Run setup wizard
mcpagent

# Start in mock mode
mcpagent start --mock

# Open chat
mcpagent chat
```

### Connect Real API

```bash
# Create handbook
mcpagent handbook init my-api

# Configure service
mcpagent service auth my-api

# Start with handbook
mcpagent start --handbook ~/handbooks/my-api
```

### Development Workflow

```bash
# Check requirements
mcpagent doctor

# Build and start
mcpagent start --build --mock

# Check status
mcpagent status

# View logs
mcpagent logs app -f

# Stop
mcpagent stop
```

## Requirements

- **Node.js** >= 20
- **Java** 21 (for running the agent)
- **Maven** (for building the agent)

Optional:
- **OpenTelemetry Collector** (for telemetry)

## Architecture

The CLI manages multiple services:

1. **OpenTelemetry Collector** (port 4317) - Telemetry collection
2. **TypeScript Runtime** (port 7070) - Executes TypeScript snippets
3. **MCP Agent** (port 8080) - Main Spring Boot application
4. **Mock Server** (port 8082) - Acme Analytics (optional)

All services are managed as child processes with automatic health checks and log management.

## Troubleshooting

### CLI won't start

```bash
# Check requirements
mcpagent doctor

# Rebuild
cd cli && npm run build
```

### Agent won't start

```bash
# Build project
mcpagent start --build

# Check logs
mcpagent logs app

# Validate handbook
mcpagent handbook validate
```

### Services not healthy

```bash
# Check status
mcpagent status

# View service logs
mcpagent logs ts-runtime
mcpagent logs app

# Restart
mcpagent stop
mcpagent start
```

### Token expired

```bash
# Renew token
mcpagent service renew <service-name>
```

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/Gentoro-HQ/mcpagent.git
cd mcpagent

# Install dependencies
cd cli
npm install

# Build
npm run build

# Link for local development
npm link

# Run in dev mode
npm run dev
```

### Project Structure

```
cli/
├── src/
│   ├── index.ts              # Main entry point
│   ├── types.ts              # Type definitions
│   ├── config/               # Configuration management
│   │   ├── manager.ts
│   │   └── paths.ts
│   ├── services/             # Service management
│   │   ├── process-manager.ts
│   │   └── agent-service.ts
│   ├── wizard/               # Setup wizard
│   │   └── setup.ts
│   ├── chat/                 # Chat mode
│   │   └── chat-mode.ts
│   └── handbook/             # Handbook management
│       └── manager.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

## License

See [LICENSE](../LICENSE) for details.

## Support

- **Documentation**: https://github.com/Gentoro-HQ/mcpagent
- **Issues**: https://github.com/Gentoro-HQ/mcpagent/issues
- **Discussions**: https://github.com/Gentoro-HQ/mcpagent/discussions

