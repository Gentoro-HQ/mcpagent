# Quick Start Guide

Get up and running with Gentoro MCP Agent CLI in 5 minutes.

## Installation

```bash
curl -sSL https://gentoro.com/mcpagent | bash
```

Or install from source:

```bash
git clone https://github.com/gentoro/mcpagent.git
cd mcpagent/cli
npm install && npm run build && npm link
```

## Your First Agent (Mock Mode)

The fastest way to try MCP Agent is with the built-in mock server:

### 1. Run Setup

```bash
mcpagent
```

Follow the wizard:
- Choose your AI provider (OpenAI, Gemini, or Anthropic)
- Enter your API key
- Select "Start with mock Acme Analytics"

### 2. Start the Agent

```bash
mcpagent start --mock
```

Wait ~30 seconds for all services to start.

### 3. Chat with Your Agent

```bash
mcpagent chat
```

Try these queries:
```
> Show me total sales for electronics in California
> List top 5 customers by revenue
> What are the sales trends by region?
```

### 4. Check Status

```bash
mcpagent status
```

### 5. Stop the Agent

```bash
mcpagent stop
```

## Connect Your Own API

### 1. Create a Handbook

```bash
mcpagent handbook init my-api
```

This creates:
```
~/handbooks/my-api/
├── Agent.md          # Agent instructions
├── apis/             # Put OpenAPI specs here
├── docs/             # Documentation
├── config/           # Configuration
└── state/            # Runtime data (auto-generated)
```

### 2. Add Your OpenAPI Specification

```bash
# Copy your OpenAPI spec to the apis directory
cp my-api-spec.yaml ~/handbooks/my-api/apis/
```

### 3. Configure Authentication

```bash
mcpagent service auth my-api
```

Provide:
- Service base URL
- Auth header name (e.g., "Authorization")
- Pattern (e.g., "Bearer {token}")
- Access token

### 4. Update Agent Instructions

Edit `~/handbooks/my-api/Agent.md` to define your agent's behavior.

### 5. Start with Your Handbook

```bash
mcpagent start --handbook ~/handbooks/my-api
```

### 6. Test Your Agent

```bash
mcpagent chat
```

## Common Tasks

### Switch AI Provider

```bash
mcpagent provider switch
```

### View Logs

```bash
# View all logs
mcpagent logs

# View specific service
mcpagent logs app

# Follow logs in real-time
mcpagent logs app -f
```

### Validate Your Handbook

```bash
mcpagent handbook validate ~/handbooks/my-api
```

### Renew Expired Token

```bash
mcpagent service renew my-api
```

### Check System Health

```bash
mcpagent doctor
```

## Troubleshooting

### Agent won't start

```bash
# Check requirements
mcpagent doctor

# Build project if needed
mcpagent start --build
```

### Services unhealthy

```bash
# Check status
mcpagent status

# View logs
mcpagent logs app
mcpagent logs ts-runtime

# Restart
mcpagent stop && mcpagent start
```

### Chat not working

1. Ensure agent is running: `mcpagent status`
2. Check logs: `mcpagent logs app`
3. Verify API key is configured
4. Try restarting: `mcpagent stop && mcpagent start`

## Architecture Overview

When you run `mcpagent start`, the CLI manages these services:

```
┌─────────────────────────────────────────────────┐
│  MCP Agent CLI (Process Manager)                │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────┐  Port 4317               │
│  │ OTEL Collector   │  (Telemetry)             │
│  └──────────────────┘                           │
│           ↓                                      │
│  ┌──────────────────┐  Port 7070               │
│  │ TS Runtime       │  (Code Execution)        │
│  └──────────────────┘                           │
│           ↓                                      │
│  ┌──────────────────┐  Port 8080               │
│  │ MCP Agent        │  (Main App)              │
│  │ (Spring Boot)    │  /mcp endpoint           │
│  └──────────────────┘                           │
│           ↓                                      │
│  ┌──────────────────┐  Port 8082 (Optional)    │
│  │ Mock Server      │  (Acme Analytics)        │
│  └──────────────────┘                           │
│                                                  │
└─────────────────────────────────────────────────┘
```

## Configuration Files

### Global Config: `~/.mcpagent/config.yaml`

```yaml
provider: openai
apiKey: sk-...
defaultPort: 8080
handbookDir: ~/handbooks
logDir: ~/.mcpagent/logs
```

### Service Config: `~/.mcpagent/services/my-api.yaml`

```yaml
service: my-api
baseUrl: https://api.example.com
header: Authorization
pattern: Bearer {token}
token: eyJh...
expiresAt: 2025-10-25T14:02:12Z
```

## Next Steps

- Read the full [README](README.md)
- Explore [example handbooks](../src/acme-analytics-server/mcpagent-handbook/)
- Check out [MCP documentation](https://modelcontextprotocol.io/)
- Join our [community discussions](https://github.com/gentoro/mcpagent/discussions)

## Getting Help

- **Documentation**: Full CLI reference in [README.md](README.md)
- **Issues**: Report bugs at [GitHub Issues](https://github.com/gentoro/mcpagent/issues)
- **Chat**: Join our community discussions

## Examples

See [examples/](examples/) directory for:
- Custom handbook configurations
- Service integration examples
- Advanced agent instructions
- Multi-service setups

