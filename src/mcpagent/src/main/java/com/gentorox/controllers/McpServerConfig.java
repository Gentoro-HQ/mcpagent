package com.gentorox.controllers;

import io.modelcontextprotocol.server.transport.WebFluxStreamableServerTransportProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpServerConfig {
  @Bean
  WebFluxStreamableServerTransportProvider serverTransportProvider() {
    return WebFluxStreamableServerTransportProvider.builder()
        .build();
  }
}
