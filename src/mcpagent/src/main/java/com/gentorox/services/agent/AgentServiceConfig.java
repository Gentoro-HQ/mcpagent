package com.gentorox.services.agent;

import com.gentorox.services.inference.InferenceService;
import com.gentorox.services.knowledgebase.KnowledgeBaseService;
import com.gentorox.tools.NativeTool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Spring configuration for creating and initializing the AgentService bean.
 * <p>
 * This configuration validates the configured foundation directory and initializes
 * the AgentService with the required dependencies.
 */
@Configuration
public class AgentServiceConfig {
  private static final Logger LOGGER = LoggerFactory.getLogger(AgentServiceConfig.class);

  /**
   * Creates and initializes the AgentService bean.
   *
   * @param rootFoundationDir the root path of the knowledge base foundation directory. Can be configured via
   *                          the property "knowledgeBase.foundation.dir". Defaults to "/var/foundation".
   * @param inferenceService  the inference service dependency
   * @param kbService         the knowledge base service dependency
   * @param nativeTools       the list of native tools available to the agent
   * @return a fully initialized AgentService instance
   * @throws IOException if initialization fails with an I/O error
   */
  @Bean
  public AgentService agentService(
      @Value("${knowledgeBase.foundation.dir:/var/foundation}") String rootFoundationDir,
      InferenceService inferenceService,
      KnowledgeBaseService kbService,
      List<NativeTool> nativeTools) throws IOException {

    Path rootFoundationPath = Path.of(rootFoundationDir);
    LOGGER.info("Initializing AgentService with foundation dir: {}", rootFoundationPath.toAbsolutePath());
    if (!Files.exists(rootFoundationPath) || !Files.isDirectory(rootFoundationPath)) {
      throw new IllegalStateException("Foundation dir not found or not a directory: " + rootFoundationPath.toAbsolutePath());
    }

    AgentService agentService = new AgentService(inferenceService, kbService, nativeTools);
    agentService.initialize(rootFoundationPath);
    LOGGER.info("AgentService initialized");
    return agentService;
  }
}
