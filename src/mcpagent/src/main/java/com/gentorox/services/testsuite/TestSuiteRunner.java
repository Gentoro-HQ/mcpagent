package com.gentorox.services.testsuite;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.gentorox.core.model.InferenceRequest;
import com.gentorox.orchestrator.Orchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import java.io.File;
import java.util.List;
import java.util.Map;

public final class TestSuiteRunner {
  private static final Logger log = LoggerFactory.getLogger(TestSuiteRunner.class);
  private TestSuiteRunner() {}
  public static void run() {
    String foundation = System.getenv().getOrDefault("FOUNDATION_DIR", "/var/foundation");
    File suiteFile = new File(foundation, "TestSuite.yaml");
    if (!suiteFile.exists()) { log.warn("TestSuite.yaml not found at {}", suiteFile.getAbsolutePath()); return; }
    try {
      ObjectMapper om = new ObjectMapper(new YAMLFactory());
      Suite suite = om.readValue(suiteFile, Suite.class);
      ApplicationContext ctx = new AnnotationConfigApplicationContext("com.gentorox");
      Orchestrator orchestrator = ctx.getBean(Orchestrator.class);
      int passed = 0;
      for (Case c : suite.suite) {
        log.info("Running test [{}] - {}", c.uid, c.description);
        var msg = new InferenceRequest.Message("user", c.prompt);
        var resp = orchestrator.run(List.of(msg), Map.of());
        boolean ok = basicCheck(resp.content(), c.assertion);
        if (ok) { passed++; log.info("✅  [{}] passed", c.uid); }
        else { log.error("❌  [{}] failed\nAssertion: {}\nOutput: {}", c.uid, c.assertion, resp.content()); }
      }
      log.info("TestSuite finished. Passed {}/{}", passed, suite.suite.size());
    } catch (Exception e) { log.error("TestSuite failed", e); }
  }
  private static boolean basicCheck(String content, String assertion) {
    if (content == null || content.isBlank()) return false;
    if (assertion != null && assertion.toLowerCase().contains("list")) {
      return content.contains("\n") || content.contains(",") || content.contains("- ");
    }
    return true;
  }
  @JsonIgnoreProperties(ignoreUnknown = true) public static class Suite { public java.util.List<Case> suite; }
  @JsonIgnoreProperties(ignoreUnknown = true) public static class Case { public String uid; public String description; public String prompt; public String assertion; }
}
