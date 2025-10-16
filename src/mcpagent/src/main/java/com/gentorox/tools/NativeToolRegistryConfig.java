package com.gentorox.tools;

import com.gentorox.services.knowledgebase.KnowledgeBaseService;
import com.gentorox.services.telemetry.TelemetryService;
import com.gentorox.services.typescript.TypescriptRuntimeClient;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class NativeToolRegistryConfig {

  @Bean
  public NativeToolsRegistry nativeToolsRegistry(ApplicationContext applicationContext) {
    return new NativeToolsRegistry(
        List.of(
            new RetrieveContextTool(applicationContext),
            new RunTsCodeTool(applicationContext)
        ));
  }

}
