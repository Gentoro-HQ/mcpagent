package com.gentorox.services.models.anthropic;

import com.gentorox.core.api.ModelProvider;
import com.gentorox.core.api.ToolSpec;
import com.gentorox.core.model.InferenceRequest;
import com.gentorox.core.model.InferenceResponse;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class AnthropicProvider implements ModelProvider {
  
  public AnthropicProvider() {
    // TODO: The Anthropic Java SDK 2.8.1 has a different API structure than what this code was written for.
    // You need to update this class to use the correct API for version 2.8.1.
    // See: https://github.com/anthropics/anthropic-sdk-java
  }

  @Override 
  public String id() { 
    return "anthropic"; 
  }

  @Override
  public InferenceResponse infer(InferenceRequest req, List<ToolSpec> tools) {
    throw new UnsupportedOperationException(
        "Anthropic provider not implemented for SDK version 2.8.1. " +
        "Please update the AnthropicProvider class to use the correct API. " +
        "The API structure has changed significantly from the original implementation."
    );
  }
}
