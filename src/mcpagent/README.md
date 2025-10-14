# MCP Agent

This module contains the MCP Agent service and its tests.

## Running tests

The project separates unit tests from integration tests using Maven Surefire and Failsafe.

- Unit tests match: `**/*Test.java`
- Integration tests match: `**/*IntegrationTest.java`

### Commands
- Unit tests only (default):
  - `mvn test`
- Run unit + integration tests:
  - `mvn verify`
- Run only integration tests (skip unit tests):
  - `mvn -DskipTests -DskipITs=false verify`
- Skip integration tests even during `verify`:
  - `mvn -DskipITs verify`

Notes:
- Surefire runs during the `test` phase and is configured to exclude `*IntegrationTest.java`.
- Failsafe runs during the `integration-test` and `verify` phases and is configured to include only `*IntegrationTest.java`.

### Environment for integration tests
Some integration tests call external services and may require them to be running locally:

- TypeScript Runtime service used by `TypescriptRuntimeClientIntegrationTest`:
  - Base URL is taken from environment variable `TS_RUNTIME_URL` (default: `http://localhost:3000`).
  - There is a reference implementation under `src/typescript-runtime/` in this repository which you can start according to its README.

If these services are not available, you may see connection-related test failures in the integration test suite. You can either start the services or skip ITs as shown above.
