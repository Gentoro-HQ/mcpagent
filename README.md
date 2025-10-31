# Gentoro MCP Agent

A production-ready MCP (Model Context Protocol) server that connects AI models to your applications and data sources. Built with Spring Boot and Java 21, it provides a unified HTTP endpoint for OpenAI, Google Gemini, and Anthropic models with built-in knowledge base management and tool integration.

## Quick Start

### CLI Tool

**Prerequisites:**
- **Node.js** >= 20
- **Java** >= 21
- **Maven** (for building the agent)
- **Git** (for cloning the repository)
- **API Keys** for at least one of the supported providers:
  - OpenAI API key
  - Google Gemini API key
  - Anthropic API key

**Installation:**
```bash
curl -sSL https://raw.githubusercontent.com/Gentoro-HQ/mcpagent/main/cli/install.sh | bash
```

**Quick Try with `onemcp chat`:**
```bash
# This single command will:
# - Run setup wizard if not configured (prompts for API keys)
# - Start MCP Agent services automatically (with mock data for testing)
# - Open interactive chat interface
onemcp chat
```

For detailed CLI documentation, all commands, and advanced features, see the [CLI README](cli/README.md).

### Using Docker

**Prerequisites:**
- **Docker**
- **API Keys** for at least one of the supported providers:
  - OpenAI API key
  - Google Gemini API key
  - Anthropic API key

```bash
# Pull latest image
docker pull admingentoro/gentoro:latest
```

```bash
# Run with OPENAI API
docker run --name mcpagent -p 8080:8080 -e OPENAI_API_KEY=your-key admingentoro/gentoro:latest
```

### Using Docker with Custom Foundation Folder

```bash
# Run within your custom foundation folder
docker run --name mcpagent -p 8080:8080 \
  -v $(pwd):/var/foundation \
  -e OPENAI_API_KEY=your-key \
  admingentoro/gentoro:latest
```

**Foundation Validation**: The agent automatically validates your foundation folder structure. You can also validate manually:

```bash
# Validate foundation before running
docker run --rm \
  -v $(pwd):/var/foundation \
  -e APP_ARGS="--process=validate" \
  admingentoro/gentoro:latest
```

If validation fails, check the container logs for specific error messages and guidance.

## MCP Inspector

Use the MCP Inspector to interact with your agent:

```bash
# Launch the MCP Inspector
npx @modelcontextprotocol/inspector@latest --port 3001 --open
```

When the inspector opens:
1. MCP URL should be set to `http://localhost:8080/mcp` 
2. Tweak configuration based on your preference and requirements
3. Click "Connect"

**Note:** Wait 30-60 seconds for the server to fully initialize before connecting the MCP Inspector.

## Container Management

With named containers, you can easily manage the MCP Agent:

```bash
# Start/stop the container
docker start mcpagent
docker stop mcpagent

# View logs
docker logs mcpagent

# Access container shell
docker exec -it mcpagent bash

# Remove container when done
docker rm mcpagent
```

## Troubleshooting

### Slow Startup (30-60 seconds)
The default configuration uses AI hint generation which can be slow. For faster startup:

```bash
# Disable AI hint generation
docker run --name mcpagent -p 8080:8080 \
  -e OPENAI_API_KEY=your-key \
  -e KNOWLEDGE_BASE_HINT_USE_AI=false \
  admingentoro/gentoro:latest
```

### MCP Inspector Connection Issues
If the MCP Inspector shows "socket hang up" errors:
1. Wait 30-60 seconds for the server to fully initialize
2. Ensure the MCP URL is set to `http://localhost:8080/mcp`
3. Try refreshing the connection in the MCP Inspector

### TypeScript Runtime Issues
If you see TypeScript runtime errors, the optimized version includes fixes:
- Proper startup order (TypeScript runtime starts first)
- Health check endpoints
- Retry logic for failed connections

