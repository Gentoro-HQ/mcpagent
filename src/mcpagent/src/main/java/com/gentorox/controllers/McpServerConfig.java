package com.gentorox.controllers;

// MCP dependencies are temporarily disabled due to dependency issues
// import io.modelcontextprotocol.spring.server.McpServerConfigurer;
// import io.modelcontextprotocol.spring.server.McpServerRegistry;
// import io.modelcontextprotocol.core.transport.httpstream.HttpStreamServerTransport;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// Temporarily disabled due to MCP dependency issues
// @Configuration
public class McpServerConfig {
  // Temporarily disabled due to MCP dependency issues
  /*
  @Bean
  McpServerConfigurer serverConfigurer() {
    return new McpServerConfigurer() {
      @Override
      public void configure(McpServerRegistry registry) {
        registry.transport(HttpStreamServerTransport.builder().path("/mcp").build());
      }
    };
  }
  */
}
