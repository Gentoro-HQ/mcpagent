# Gentoro MCP Agent

A production-ready MCP (Model Context Protocol) server that connects AI models to your applications and data sources. Built with Spring Boot and Java 21, it provides a unified HTTP endpoint for OpenAI, Google Gemini, and Anthropic models with built-in knowledge base management and tool integration.

## Prerequisites

- **Docker** (for recommended setup) or **Java 21** and **Maven** (for local development)
- **Node.js** and **npm** (for MCP Inspector)
- **API Keys** for at least one of the supported providers:
  - OpenAI API key
  - Google Gemini API key  
  - Anthropic API key

## Foundation

The MCP Agent uses a **foundation folder** containing your agent's knowledge base:
- `Agent.md` - Agent instructions and behavior
- `docs/` - Documentation files
- `apis/` - OpenAPI specifications
- `state/` - Knowledge base state (auto-generated)

The Docker image includes default ACME Analytics Server content, if you simply run with [Using Docker](#using-docker) or you can provide your own foundation folder (see [Using Docker with Custom Foundation Folder](#using-docker-with-custom-foundation-folder) below).

## Quick Start

### Using Docker

```bash
# Pull and run the latest image
docker pull admingentoro/gentoro:latest
docker run -p 8080:8080 -e OPENAI_API_KEY=your-key admingentoro/gentoro:latest
```

### Using Docker with Custom Foundation Folder

```bash
# Run within your custom foundation folder
docker run -p 8080:8080 \
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

