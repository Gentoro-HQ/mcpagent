package com.gentorox.cli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Service for managing CLI configuration files.
 */
@Service
public class CliConfigService {
  private static final Logger logger = LoggerFactory.getLogger(CliConfigService.class);
  
  private static final String CONFIG_DIR = System.getProperty("user.home") + "/.mcpagent";
  private static final Path CONFIG_FILE = Paths.get(CONFIG_DIR, "config.yaml");
  private static final Path SERVICES_DIR = Paths.get(CONFIG_DIR, "services");
  
  private final ObjectMapper yamlMapper;
  
  public CliConfigService() {
    this.yamlMapper = new ObjectMapper(new YAMLFactory());
    initializeDirectories();
  }
  
  private void initializeDirectories() {
    try {
      Files.createDirectories(SERVICES_DIR);
    } catch (IOException e) {
      logger.warn("Failed to create CLI config directories", e);
    }
  }
  
  /**
   * Load CLI configuration from file.
   */
  public CliConfig loadConfig() {
    try {
      if (Files.exists(CONFIG_FILE)) {
        return yamlMapper.readValue(CONFIG_FILE.toFile(), CliConfig.class);
      }
    } catch (IOException e) {
      logger.warn("Failed to load CLI config", e);
    }
    return CliConfig.empty();
  }
  
  /**
   * Save CLI configuration to file.
   */
  public void saveConfig(CliConfig config) {
    try {
      yamlMapper.writeValue(CONFIG_FILE.toFile(), config);
    } catch (IOException e) {
      logger.error("Failed to save CLI config", e);
      throw new RuntimeException("Failed to save CLI config", e);
    }
  }
  
  /**
   * Load service configuration.
   */
  public ServiceConfig loadServiceConfig(String serviceName) {
    Path serviceFile = SERVICES_DIR.resolve(serviceName + ".yaml");
    try {
      if (Files.exists(serviceFile)) {
        return yamlMapper.readValue(serviceFile.toFile(), ServiceConfig.class);
      }
    } catch (IOException e) {
      logger.warn("Failed to load service config for {}", serviceName, e);
    }
    return null;
  }
  
  /**
   * Save service configuration.
   */
  public void saveServiceConfig(ServiceConfig config) {
    Path serviceFile = SERVICES_DIR.resolve(config.service() + ".yaml");
    try {
      yamlMapper.writeValue(serviceFile.toFile(), config);
    } catch (IOException e) {
      logger.error("Failed to save service config", e);
      throw new RuntimeException("Failed to save service config", e);
    }
  }
  
  /**
   * Get the configuration directory path.
   */
  public String getConfigDir() {
    return CONFIG_DIR;
  }
  
  /**
   * Get the services directory path.
   */
  public String getServicesDir() {
    return SERVICES_DIR.toString();
  }
}
