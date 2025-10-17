export default function HomePage() {
  return (
    <main className="home-hero">
      <h1 className="home-title">MCP Agent</h1>
      <p className="home-subtitle">
        Knowledge-driven agent runtime for the Model Context Protocol. Build reliable tool actions
        with dynamic code generation, retrieval, and built-in observability.
      </p>
      <div className="home-actions">
        <a href="/docs" className="btn-primary">Get Started</a>
        <a
          href="https://github.com/gentoro-GT/mcpagent"
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
