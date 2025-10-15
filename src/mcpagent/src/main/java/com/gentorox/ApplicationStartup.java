package com.gentorox;

import com.gentorox.services.indexer.ValidationRunner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Boots optional processes on application startup based on the `--process` argument.
 */
@Component
public class ApplicationStartup implements ApplicationRunner {
  private static final Logger LOG = LoggerFactory.getLogger(ApplicationStartup.class);

  @Override
  public void run(ApplicationArguments args) {
    String process = args.containsOption("process") ? args.getOptionValues("process").get(0) : "standard";
    switch (process) {
      case "validate" -> ValidationRunner.run();
      default -> LOG.info("Starting standard mode (MCP server + orchestrator)");
    }
  }
}
