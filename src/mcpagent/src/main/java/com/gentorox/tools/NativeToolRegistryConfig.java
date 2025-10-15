package com.gentorox.tools;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class NativeToolRegistryConfig {

  @Bean
  public NativeToolsRegistry nativeToolsRegistry(List<NativeTool> tools) {
    return new NativeToolsRegistry(tools);
  }

}
