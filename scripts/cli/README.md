# Gentoro MCP Agent CLI

The Gentoro MCP Agent provides a fast, consistent way to connect your APIs to AI models that support the Model Context Protocol (MCP). It removes the need to build custom adapters or middleware. You can start with a built-in mock environment or connect your own service with minimal setup.

## Installation

From GitHub:

```bash
curl -sSL https://raw.githubusercontent.com/gentorox/mcpagent/main/install.sh | bash
```

Or from the project root:

```bash
bash install.sh
```

Or manually:

```bash
cp scripts/cli/mcpagent.sh ~/.local/bin/mcpagent
chmod +x ~/.local/bin/mcpagent
```

Make sure `~/.local/bin` is in your PATH.

## Uninstallation

To remove the CLI:

```bash
# From GitHub
curl -sSL https://raw.githubusercontent.com/gentorox/mcpagent/main/uninstall.sh | bash

# Or locally
bash uninstall.sh
```

The uninstaller will:
- Stop any running agent
- Remove the CLI binary
- Ask if you want to remove configuration files (optional)

## First Run

```bash
mcpagent
```

If no configuration is found, the CLI runs an interactive setup wizard.

## Commands

### `mcpagent start`

Start the MCP Agent. The agent will run in the background.

```bash
mcpagent start
```

The agent will:
- Run the setup wizard if this is the first time
- Start with mock Acme Analytics if no custom service is configured
- Launch the Java application as a background process
- Make the MCP endpoint available at `http://localhost:8080/mcp`

### `mcpagent chat`

Open an interactive prompt to chat with the agent.

```bash
mcpagent chat
```

### `mcpagent stop`

Stop the running agent.

```bash
mcpagent stop
```

### `mcpagent status`

Show the current running status of the agent.

```bash
mcpagent status
```

### `mcpagent logs [tail|export]`

View or export agent logs.

```bash
mcpagent logs tail    # Tail logs in real-time
mcpagent logs export  # Export logs as tar.gz
```

### `mcpagent service auth <service-name>`

Configure authentication for a service.

```bash
mcpagent service auth acme
```

This will prompt you for:
- Header name (default: `Authorization`)
- Pattern (default: `Bearer {token}`)
- Access token

### `mcpagent service renew <service-name>`

Renew the token for a service.

```bash
mcpagent service renew acme
```

Only the token is requested during renewal. The header name and pattern remain unchanged.

### `mcpagent service list`

List all configured services.

```bash
mcpagent service list
```

### `mcpagent handbook init [directory]`

Initialize a handbook directory.

```bash
mcpagent handbook init          # Initialize in ./handbook
mcpagent handbook init ./my-api # Initialize in ./my-api
```

This creates the directory structure:
```
handbook/
├── Agent.md          # Agent instructions
├── apis/             # OpenAPI specifications
├── docs/             # Documentation files
├── regression/       # Test definitions
└── state/            # Auto-generated runtime data
```

### `mcpagent handbook validate [directory]`

Validate a handbook directory.

```bash
mcpagent handbook validate
```

### `mcpagent doctor`

Run diagnostics to check:
- Docker installation
- Java installation
- Port availability
- Configuration

```bash
mcpagent doctor
```

### `mcpagent version`

Show the CLI and agent version.

```bash
mcpagent version
```

### `mcpagent help`

Show help information.

```bash
mcpagent help
```

## Configuration

### Global Configuration

Stored in `~/.mcpagent/config.yaml`:

```yaml
provider: openai
default_port: 8080
handbook_dir: ~/.mcpagent/handbooks
```

### Service Configuration

Stored in `~/.mcpagent/services/<service-name>.yaml`:

```yaml
service: acme-analytics
header: Authorization
pattern: Bearer {token}
token: eyJh...
expires_at: 2025-10-25T14:02:12Z
```

## Handbook Directory

Each MCP Agent runs from a handbook directory, which defines everything the agent needs:

- `Agent.md` - Instructions and behavior
- `apis/` - OpenAPI specifications
- `docs/` - Supplementary markdown docs
- `regression/` - Optional test definitions
- `state/` - Auto-generated runtime data

## Authentication Model

Each service defines how to construct its authentication header:

| Field | Description | Example |
|-------|-------------|---------|
| `header` | HTTP header name | `Authorization` |
| `pattern` | Format containing `{token}` | `Bearer {token}` |
| `token` | The current access token | `eyJh...` |

## Token Expiration and Renewal

If a target service returns 401 Unauthorized, the CLI handles it automatically by prompting for a new token. Only the token is requested during renewal—the header name and pattern remain unchanged.

## Example Workflows

### Mock Mode

Start with the built-in mock service:

```bash
mcpagent start
```

### Connect Real API

1. Initialize a handbook:
```bash
mcpagent handbook init ./my-service
```

2. Configure service authentication:
```bash
mcpagent service auth my-service
```

3. Start the agent:
```bash
mcpagent start
```

### Renew Token

```bash
mcpagent service renew my-service
```

## Troubleshooting

### Agent won't start

1. Check if Java is installed:
```bash
java -version
```

2. Build the project:
```bash
cd src/mcpagent
mvn clean package
```

3. Run diagnostics:
```bash
mcpagent doctor
```

### Port already in use

Change the port in your configuration:
```yaml
# ~/.mcpagent/config.yaml
default_port: 8081
```

### Can't connect to agent

Check if the agent is running:
```bash
mcpagent status
```

Check logs:
```bash
mcpagent logs tail
```

## Development

To develop the CLI:

1. Build the Java application:
```bash
cd src/mcpagent
avian clean package
```

2. Test the CLI locally:
```bash
bash scripts/cli/mcpagent.sh start
```

3. Run with specific handbook:
```bash
FOUNDATION_DIR=/path/to/handbook bash scripts/cli/mcpagent.sh start
```

## License

See LICENSE file in the project root.
