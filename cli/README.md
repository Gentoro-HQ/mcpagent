# Gentoro MCP Agent CLI

The Gentoro MCP Agent CLI provides a fast, consistent way to connect your APIs to AI models that support the Model Context Protocol (MCP).

It removes the need to build custom adapters or middleware. You can start with a built-in mock environment or connect your own service with minimal setup.

## Features

- 🚀 **Quick Start**: Interactive setup wizard for first-time users
- 🔄 **Auto Updates**: `onemcp update` command keeps you current
- 🤖 **Multiple Providers**: Support for OpenAI, Google Gemini, and Anthropic Claude
- 🔧 **Easy Configuration**: Local configuration management
- 💬 **Interactive Chat**: Built-in chat mode with automatic example queries when using mock server
- 📚 **Handbook Management**: Create and manage agent handbooks
- 🔐 **Auth Management**: Handle service authentication and token renewal
- 📊 **Mock Mode**: Test with built-in Acme Analytics service
- 🔍 **Diagnostics**: Built-in doctor command for troubleshooting

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

## Installation

### One-Command Install

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | bash
```

This automatically:
- Checks system requirements (Node.js 20+, Java 21, Maven)
- Clones the repository to `~/.onemcp-src`
- Builds the Java application and TypeScript runtime
- Installs the CLI using the default method (npm global)
- No PATH modifications needed with the default installation method

### Installation Methods

The installer supports multiple installation methods:

#### 1. npm Global (Recommended - Default)

Installs via npm globally - **no PATH changes needed**:

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | bash
# or explicitly:
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | \
  MCPAGENT_INSTALL_METHOD=npm-global \
  bash
```

#### 2. System-wide Installation

Installs to `/usr/local/bin` (available to all users, requires sudo):

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | \
  MCPAGENT_INSTALL_METHOD=system-wide \
  bash
```

#### 3. Local Bin Installation

Installs to `~/.local/bin` (original behavior):

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | \
  MCPAGENT_INSTALL_METHOD=local-bin \
  bash
```

**Note:** If `~/.local/bin` is not in your PATH, add it:
```bash
# For zsh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# For bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

#### 4. Wrapper Script

Creates a portable wrapper script that you can place anywhere:

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | \
  MCPAGENT_INSTALL_METHOD=wrapper \
  MCPAGENT_WRAPPER_PATH=/path/to/your/onemcp \
  bash
```

**For testing with a specific branch:**
```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | \
  MCPAGENT_REPO_BRANCH=your-branch-name \
  bash
```

**Environment variables:**
- `MCPAGENT_REPO_URL` - Git repository URL (default: https://github.com/Gentoro-HQ/mcpagent.git)
- `MCPAGENT_REPO_BRANCH` - Branch name (default: main)
- `MCPAGENT_INSTALL_METHOD` - Installation method (default: npm-global)
  - `npm-global`: Install via npm globally (recommended)
  - `system-wide`: Install to /usr/local/bin
  - `local-bin`: Install to ~/.local/bin
  - `wrapper`: Create wrapper script (requires MCPAGENT_WRAPPER_PATH)
- `MCPAGENT_WRAPPER_PATH` - Path for wrapper script (only used with wrapper method)

**For local development:**

```bash
git clone https://github.com/Gentoro-HQ/mcpagent.git && cd onemcp/cli && npm install && npm run build && npm link
```

## Uninstallation

To completely remove MCP Agent CLI:

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/uninstall.sh | bash
```

Or if you have the source:

```bash
bash ~/.onemcp-src/cli/uninstall.sh
```

The uninstall script automatically detects your installation method and removes the CLI accordingly.

### Uninstall Methods

The uninstall script supports all installation methods:

#### Automatic Detection (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/uninstall.sh | bash
```

The script will auto-detect how onemcp was installed and remove it appropriately.

#### Manual Method Specification

If auto-detection fails, you can specify the uninstall method:

```bash
# For npm global installation
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/uninstall.sh | \
  MCPAGENT_UNINSTALL_METHOD=npm-global \
  bash

# For system-wide installation
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/uninstall.sh | \
  MCPAGENT_UNINSTALL_METHOD=system-wide \
  bash

# For wrapper script (specify the path)
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/uninstall.sh | \
  MCPAGENT_UNINSTALL_METHOD=wrapper \
  MCPAGENT_WRAPPER_PATH=/path/to/onemcp \
  bash
```

**Environment variables:**
- `MCPAGENT_UNINSTALL_METHOD` - Specify uninstall method (auto-detect if not set)
  - `npm-global`: Remove from npm global packages
  - `system-wide`: Remove from /usr/local/bin (may require sudo)
  - `local-bin`: Remove from ~/.local/bin
  - `wrapper`: Remove wrapper script (requires MCPAGENT_WRAPPER_PATH)
- `MCPAGENT_WRAPPER_PATH` - Path to wrapper script (only needed for wrapper method)
- `MCPAGENT_YES=1` - Auto-confirm all prompts
- `MCPAGENT_REMOVE_CONFIG=1` - Auto-remove configuration directory
- `MCPAGENT_REMOVE_HANDBOOKS=1` - Auto-remove handbooks directory

The uninstall script will:
- Stop all running services
- Remove the CLI command (using appropriate method)
- Remove source code and binaries (~500MB)
- Prompt before removing configuration and handbooks (unless auto-confirmed)
- Clean up temporary files

**Manual uninstallation (if script fails):**

```bash
# Stop services
onemcp stop

# Remove based on installation method:
# npm global: npm uninstall -g @gentoro/onemcp-cli
# system-wide: sudo rm /usr/local/bin/onemcp
# local-bin: rm ~/.local/bin/onemcp
# wrapper: rm /path/to/your/wrapper

# Remove source and data
rm -rf ~/.onemcp-src
rm -rf ~/.onemcp      # Configuration and logs
rm -rf ~/handbooks      # Your handbooks (optional)
```

## Getting Started

The easiest way to get started is with mock mode, which uses the built-in Acme Analytics service with a complete handbook pre-configured.

```bash
onemcp chat
```

The first time you run `onemcp chat`, it will automatically launch an interactive setup wizard:

```
╭──────────────────────────────────────╮
│      Gentoro MCP Agent Setup         │
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

This will:
1. Run the setup wizard automatically if not configured
2. Start all required services
3. Open the interactive chat interface

```
✅ Services started successfully

╔══════════════════════════════════════╗
║    Gentoro MCP Agent - Chat Mode     ║
╚══════════════════════════════════════╝

Provider: gemini
MCP URL: http://localhost:8080/mcp
Type 'exit' to quit, 'clear' to clear history
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You:
```

### Acme Analytics

When you select "Start with mock Acme Analytics" during setup, the CLI automatically:
- Copies the ACME Analytics handbook to `~/handbooks/acme-analytics/`
- Populates the knowledge base with comprehensive API documentation
- Configures the agent to use the mock service

Acme Analytics provides four data entities:
- **Sales** — transactions and totals
- **Products** — categories and pricing
- **Customers** — segments and lifetime value
- **Regions** — geographic performance

The knowledge base includes:
- API documentation and data model
- Query examples and best practices
- OpenAPI specification for the analytics API

**Example queries** (shown automatically when you start chat with mock server):
```
> Show me electronics sales in California last quarter.
> List top customers by revenue.
> Compare revenue trends by region.
> What are the top-selling products this month?
> Show me sales data for New York vs Texas.
```

Type `help` in chat mode for additional commands.

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
├── Agent.md                    # Instructions and behavior
├── apis/                       # OpenAPI specifications
├── docs/                       # Supplementary markdown docs
├── regression/                 # Optional test definitions
└── state/                      # Auto-generated runtime data
    └── knowledge-base-state.json  # Indexed knowledge base with docs and APIs
```

### Creating a Handbook

```bash
# Initialize a new handbook
onemcp handbook init my-service

# Validate handbook structure
onemcp handbook validate ./my-service

# List all handbooks
onemcp handbook list
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
onemcp service auth acme

# Renew token only
onemcp service renew acme

# List configured services
onemcp service list
```

## CLI Commands

### Core Commands

```bash
# Start interactive chat (auto-starts services if needed)
onemcp chat

# Stop the agent
onemcp stop

# Show status
onemcp status

# Update to latest version
onemcp update

# Open interactive chat (shows example queries automatically with mock server)
onemcp chat

# View logs
onemcp logs [service]
  -n, --lines <count>     Number of lines (default: 50)
  -f, --follow            Follow log output
```

### Update Command

The `onemcp update` command automatically updates your installation to the latest version:

- Fetches the latest changes from the repository
- Rebuilds all components (Java app, TypeScript runtime, CLI)
- Updates the CLI symlink
- Shows version changes and handles errors gracefully

```bash
# Update to latest version
onemcp update

# If update fails, manual fallback
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | bash
```

### Service Management

```bash
# Configure service authentication
onemcp service auth <service-name>

# Renew service token
onemcp service renew <service-name>

# List configured services
onemcp service list
```

### Handbook Management

```bash
# Initialize new handbook
onemcp handbook init <name>
  -d, --dir <directory>   Target directory

# Validate handbook structure
onemcp handbook validate [directory]

# List all handbooks
onemcp handbook list
```

### Provider Management

```bash
# Set model provider
onemcp provider set

# Switch between providers
onemcp provider switch
```

### Diagnostics

```bash
# Check system requirements
onemcp doctor

# Show version
onemcp --version

# Show help
onemcp --help
```

## Configuration Files

### Global Configuration

Location: `~/.onemcp/config.yaml`

```yaml
provider: openai
apiKey: sk-...
defaultPort: 8080
handbookDir: ~/handbooks
logDir: ~/.onemcp/logs
```

### Service Configuration

Location: `~/.onemcp/services/acme.yaml`

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

Logs are stored in `~/.onemcp/logs/`:

```
~/.onemcp/logs/
├── app.log
├── ts-runtime.log
├── otel.log
├── mock.log
└── archive/
```

View logs:

```bash
# Tail logs for specific service
onemcp logs app -n 100

# View all logs
onemcp logs

# Check system health
onemcp doctor
```

## Example Workflows

### Mock Mode

```bash
# Check status or run setup if needed
onemcp

# Start chatting (setup and services auto-start if needed)
onemcp chat
```

### Connect Real API

```bash
# Create handbook
onemcp handbook init my-api

# Configure service
onemcp service auth my-api

# Set as default handbook
onemcp config set handbookDir ~/handbooks/my-api

# Start chatting (services auto-start)
onemcp chat
```

### Development Workflow

```bash
# Check requirements
onemcp doctor

# Build project (if needed)
# Services will auto-start when you run chat
# Note: Build is handled automatically during first run

# Start chatting (builds and starts services automatically)
onemcp chat

# Check status
onemcp status

# View logs
onemcp logs app -f

# Stop
onemcp stop
```

## Troubleshooting

### CLI won't start

```bash
# Check requirements
onemcp doctor

# Rebuild
cd cli && npm run build
```

### Agent won't start

```bash
# The build happens automatically when you run chat
# If you need to rebuild manually, use the update command
onemcp update

# Check logs
onemcp logs app

# Validate handbook
onemcp handbook validate
```

### Services not healthy

```bash
# Check status
onemcp status

# View service logs
onemcp logs ts-runtime
onemcp logs app

# Restart (services will auto-start on next chat)
onemcp stop
# Then run: onemcp chat
```

### Token expired

```bash
# Renew token
onemcp service renew <service-name>
```

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/Gentoro-HQ/mcpagent.git
cd onemcp

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

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

## License

See [LICENSE](../LICENSE) for details.

## Support

- **Documentation**: https://github.com/Gentoro-HQ/mcpagent
- **Issues**: https://github.com/Gentoro-HQ/mcpagent/issues
- **Discussions**: https://github.com/Gentoro-HQ/mcpagent/discussions

