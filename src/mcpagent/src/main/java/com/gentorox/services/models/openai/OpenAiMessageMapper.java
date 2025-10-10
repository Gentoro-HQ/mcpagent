package com.gentorox.services.models.openai;

import com.gentorox.core.model.InferenceRequest;

import java.util.List;

public class OpenAiMessageMapper {
  
  // TODO: Update this class to work with OpenAI Java SDK 4.2.0
  // The API structure has changed significantly
  
  public static Object map(List<InferenceRequest.Message> messages) {
    throw new UnsupportedOperationException("OpenAI message mapping not implemented for SDK 4.2.0");
  }
}
