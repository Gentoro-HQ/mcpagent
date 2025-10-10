package com.gentorox.services.models.gemini;

import com.gentorox.core.model.InferenceRequest;

import java.util.List;

public class GeminiMessageMapper {
  
  // TODO: Update this class to work with Google GenAI SDK 1.21.0
  
  public static Object map(List<InferenceRequest.Message> messages) {
    throw new UnsupportedOperationException("Gemini message mapping not implemented for SDK 1.21.0");
  }
  
  public static String flattenText(Object resp) {
    throw new UnsupportedOperationException("Gemini text flattening not implemented for SDK 1.21.0");
  }
}
