package com.gentorox.services.knowledgebase;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * High-level API for interacting with the knowledge base. Implementations expose abstract URIs with the
 * "kb://" scheme which are resolved to original sources on demand.
 */
public interface KnowledgeBaseService {
  /**
   * Initialize the knowledge base by attempting to restore from a persisted state, or by scanning the
   * provided foundation directory when the state is missing or stale.
   *
   * @param foundationRoot root folder containing docs, tests, feedback, and openapi subfolders; may be null
   */
  void initialize(Path foundationRoot);

  /**
   * List all entries under a given directory-like prefix. If dir is null or blank, list all.
   * The service exposes abstract knowledge base URIs with the scheme "kb://".
   * Examples: "kb://docs" or "kb://docs/Agent.md".
   *
   * @param dirPrefix abstract kb prefix
   * @return entries sorted by resource URI
   */
  List<KnowledgeBaseEntry> list(String dirPrefix);

  /**
   * Retrieve the full textual content of a resource URI (supports kb://, file://, and in-memory mem:// indirection).
   *
   * @param resourceUri kb:// or original URI
   * @return optional content
   */
  Optional<String> getContent(String resourceUri);

  /**
   * Whether the KB was restored from persisted state during the last initialization.
   *
   * @return true if loaded from cache
   */
  boolean loadedFromCache();
}
