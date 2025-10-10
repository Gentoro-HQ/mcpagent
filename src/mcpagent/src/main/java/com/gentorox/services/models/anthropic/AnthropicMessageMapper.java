package com.gentorox.services.models.anthropic;

import com.gentorox.core.model.InferenceRequest;
import com.gentorox.core.model.InferenceResponse;

import java.util.List;
import java.util.Optional;

public class AnthropicMessageMapper {
  
  // TODO: Update this class to work with Anthropic Java SDK 2.8.1
  
  public static Object map(List<InferenceRequest.Message> messages) {
    throw new UnsupportedOperationException("Anthropic message mapping not implemented for SDK 2.8.1");
  }
  
  public static Optional<InferenceResponse.ToolCall> firstToolCall(Object result) {
    throw new UnsupportedOperationException("Anthropic tool call extraction not implemented for SDK 2.8.1");
  }
}
