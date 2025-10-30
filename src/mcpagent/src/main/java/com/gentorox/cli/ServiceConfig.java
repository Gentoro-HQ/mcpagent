package com.gentorox.cli;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/**
 * Service configuration for authentication.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ServiceConfig(
    @JsonProperty("service") String service,
    @JsonProperty("header") String header,
    @JsonProperty("pattern") String pattern,
    @JsonProperty("token") String token,
    @JsonProperty("expires_at") Instant expiresAt
) {}
