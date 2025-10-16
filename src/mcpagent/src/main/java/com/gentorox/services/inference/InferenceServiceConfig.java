package com.gentorox.services.inference;

import com.gentorox.tools.NativeToolsRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring configuration for wiring the InferenceService bean.
 *
 * This configuration centralizes the creation of the InferenceService, ensuring
 * a single instance is constructed with the currently configured ProviderConfig
 * and the NativeToolsRegistry.
 */
@Configuration
public class InferenceServiceConfig {
  private static final Logger LOGGER = LoggerFactory.getLogger(InferenceServiceConfig.class);

  /**
   * Create the InferenceService bean.
   *
   * Logs the default provider in use to help operators verify that the
   * application was configured as intended.
   *
   * @param providerProperties provider selection and per-provider settings
   * @param toolsRegistry registry with currently available native tools
   * @return a configured InferenceService
   */
  @Bean
  InferenceService inferenceService(ProviderProperties providerProperties, NativeToolsRegistry toolsRegistry) {
    String defaultProvider = providerProperties != null ? providerProperties.getDefaultProvider() : null;
    LOGGER.info("Initializing InferenceService bean (defaultProvider={})", defaultProvider);
    return new InferenceService(providerProperties, toolsRegistry);
  }

}
