package com.gentorox.services.models.gemini;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.services.models.ToolTranslator;

import java.util.List;

public class GeminiToolTranslator implements ToolTranslator<Object> {
  
  // TODO: Update this class to work with Google GenAI SDK 1.21.0
  
  @Override
  public List<Object> translate(List<ToolSpec> toolSpecs) {
    throw new UnsupportedOperationException("Gemini tool translation not implemented for SDK 1.21.0");
  }
}
