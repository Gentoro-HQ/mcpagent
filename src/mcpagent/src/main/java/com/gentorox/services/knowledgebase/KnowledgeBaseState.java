package com.gentorox.services.knowledgebase;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Serializable state of the Knowledge Base, so we can persist and restore quickly on startup.
 *
 * @param signature content signature used to detect changes
 * @param entries entries included in the knowledge base
 */
public record KnowledgeBaseState(
    String signature,
    List<KnowledgeBaseEntry> entries
) {
  @JsonCreator
  public KnowledgeBaseState(@JsonProperty("signature") String signature,
                            @JsonProperty("entries") List<KnowledgeBaseEntry> entries) {
    this.signature = signature;
    this.entries = entries;
  }
}
