# Gentoro MCP Agent CLI - Quick Start

## Installation

```bash
bash scripts/cli/install.sh
```

## First Run

```bash
mcpagent
```

This will launch the interactive setup wizard:

### Step 1: Choose Provider
1. OpenAI
2. Google Gemini
3. Anthropic Claude

Enter your API key when prompted.

### Step 2: Choose Mode
1. **Mock Mode** (Recommended for first-time users) - Start with built-in Acme Analytics
2. **Connect Your Own API** - Configure your own service

## Quick Commands

```bash
# Start the agent
mcpagent start

# Check status
mcpagent status

# View logs
mcpagent logs tail

# Stop the agent
mcpagent stop

# Initialize a new handbook
mcpagent handbook init ./my-service

# Configure service authentication
mcpagent service auth my-service

# Renew a token
mcpagent service renew my-service

# Run diagnostics
mcpagent doctor
```

## Mock Mode

When you select Mock Mode, the agent starts with Acme Analytics which provides:

- **Sales** - transactions and totals
- **Products** - categories and pricing
- **Customers** - segments and lifetime value
- **Regions** - geographic performance

You can query it with questions like:
- "Show me electronics sales in California last quarter"
- "List top customers by revenue"
- "Compare revenue trends by region"

## Connect Your Own API

### 1. Initialize a Handbook

```bash
mcpagent handbook init ./my-api-handbook
```

### 2. Add OpenAPI Specifications

Place your OpenAPI specs in `./my-api-handbook/apis/`:

```bash
cp my-api.yaml ./my-api-handbook/apis/
```

### 3. Configure Authentication

```bash
mcpagent service auth my-api
```

You'll be prompted for:
- Header name (e.g., `Authorization`)
- Pattern (e.g., `Bearer {token}`)
- Access token

### 4. Start the Agent

```bash
FOUNDATION_DIR=./my-api-handbook mcpagent start
```

## Handbook Structure

```
handbook/
├── Agent.md          # Agent instructions (system prompt)
├── apis/             # OpenAPI specifications
│   ├── sales-api.yaml
│   └── inventory-api.yaml
├── docs/             # Documentation files
│   ├── getting-started.md
│   └── data-model.md
├── regression/       # Test definitions
│   └── test-suite.yaml
└── state/            # Auto-generated (don't edit)
    └── knowledge-base-state.json
```

## Configuration Files

### Global Config (`~/.mcpagent/config.yaml`)

```yaml
provider: openai
default_port: 8080
handbook_dir: ~/.mcpagent/handbooks
```

### Service Config (`~/.mcpagent/services/<service>.yaml`)

```yaml
service: my-api
header: Authorization
pattern: Bearer {token}
token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Examples

### Start with Mock Data

```bash
mcpagent
# Select 1) Mock Mode
```

### Connect to Production API

```bash
# Initialize handbook
mcpagent handbook init ./production-api

# Add OpenAPI spec
cp sales-api.yaml ./production-api/apis/

# Configure auth
mcpagent service auth production-api
# Enter: Authorization, Bearer {token}, your-token-here

# Start agent
FOUNDATION_DIR=./production-api mcpagent start
```

### Renew Expired Token

```bash
mcpagent service renew production-api
# Enter new token
```

## Troubleshooting

### Agent Won't Start

```bash
# Check what's wrong
mcpagent doctor

# Check if already running
mcpagent status

# View logs
mcpagent logs tail
```

### Can't Connect to Agent

```bash
# Verify agent is running
curl http://localhost:8080/mcp

# Check logs
mcpagent logs tail
```

### Port Already in Use

Edit `~/.mcpagent/config.yaml`:

```yaml
default_port: 8081
```

## Next Steps

- Read the full [CLI Documentation](README.md)
- Check out [Agent Configuration Guide](../../docs/app/docs/getting-started/page.mdx)
- Learn about [Adding Tools](../../docs/app/docs/guides/adding-a-tool/page.mdx)
