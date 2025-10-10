package com.gentorox.services.models.openai;

import com.gentorox.core.api.ToolSpec;
import com.gentorox.services.models.ToolTranslator;

import java.util.List;

public class OpenAiToolTranslator implements ToolTranslator<Object> {
  
  // TODO: Update this class to work with OpenAI Java SDK 4.2.0
  
  @Override
  public List<Object> translate(List<ToolSpec> toolSpecs) {
    throw new UnsupportedOperationException("OpenAI tool translation not implemented for SDK 4.2.0");
  }
}
