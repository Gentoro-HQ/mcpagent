package com.gentorox.cli;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Configuration for the CLI tool.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CliConfig(
    @JsonProperty("provider") String provider,
    @JsonProperty("api_key") String apiKey,
    @JsonProperty("default_port") Integer defaultPort,
    @JsonProperty("handbook_dir") String handbookDir
) {
  public static CliConfig empty() {
    return new CliConfig(null, null, 8080, null);
  }
}
