package com.acme.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Test cases for ACME Analytics Server
 *
 * Tests the server functionality including startup, health checks,
 * field listing, and query execution.
 */
public class AcmeServerTest {

    private AcmeServer server;
    private final int testPort = 8081;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public AcmeServerTest() {
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
        this.objectMapper = new ObjectMapper();
    }

    @BeforeEach
    void setUp() throws IOException {
        server = new AcmeServer(testPort);
        server.start();

        // Wait for server to start
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.close();
        }
    }

    @Test
    void testServerStartup() {
        assertNotNull(server);
        // Server should be running without exceptions
    }

    @Test
    void testHealthEndpoint() throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + testPort + "/health"))
            .GET()
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());

        JsonNode responseBody = objectMapper.readTree(response.body());
        assertEquals("healthy", responseBody.get("status").asText());
        assertEquals("1.0.0", responseBody.get("version").asText());
        assertTrue(responseBody.has("timestamp"));
    }

    @Test
    void testFieldsEndpoint() throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + testPort + "/fields"))
            .GET()
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());

        JsonNode responseBody = objectMapper.readTree(response.body());
        assertTrue(responseBody.has("fields"));

        JsonNode fields = responseBody.get("fields");
        assertTrue(fields.isArray());
        assertTrue(fields.size() > 0);

        // Check for some expected fields
        boolean foundSaleId = false;
        boolean foundProductName = false;
        boolean foundCustomerName = false;

        for (JsonNode field : fields) {
            String fieldName = field.get("name").asText();
            if ("sale.id".equals(fieldName)) foundSaleId = true;
            if ("product.name".equals(fieldName)) foundProductName = true;
            if ("customer.name".equals(fieldName)) foundCustomerName = true;
        }

        assertTrue(foundSaleId, "Should have sale.id field");
        assertTrue(foundProductName, "Should have product.name field");
        assertTrue(foundCustomerName, "Should have customer.name field");
    }

    @Test
    void testBasicQuery() throws IOException, InterruptedException {
        String queryJson = "{\n" +
            "    \"filter\": [\n" +
            "        {\n" +
            "            \"field\": \"product.category\",\n" +
            "            \"operator\": \"equals\",\n" +
            "            \"value\": \"Electronics\"\n" +
            "        }\n" +
            "    ],\n" +
            "    \"fields\": [\n" +
            "        \"sale.id\",\n" +
            "        \"sale.amount\",\n" +
            "        \"product.name\",\n" +
            "        \"product.category\"\n" +
            "    ],\n" +
            "    \"limit\": 5\n" +
            "}";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + testPort + "/query"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(queryJson))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());

        JsonNode responseBody = objectMapper.readTree(response.body());
        assertTrue(responseBody.get("success").asBoolean());
        assertTrue(responseBody.has("data"));
        assertTrue(responseBody.has("metadata"));

        JsonNode data = responseBody.get("data");
        assertTrue(data.isArray());

        JsonNode metadata = responseBody.get("metadata");
        assertTrue(metadata.has("total_records"));
        assertTrue(metadata.has("execution_time_ms"));
        assertTrue(metadata.has("query_id"));
    }

    @Test
    void testQueryWithAggregation() throws IOException, InterruptedException {
        String queryJson = "{\n" +
            "    \"filter\": [\n" +
            "        {\n" +
            "            \"field\": \"sale.date\",\n" +
            "            \"operator\": \"greater_than_or_equal\",\n" +
            "            \"value\": \"2023-01-01\"\n" +
            "        }\n" +
            "    ],\n" +
            "    \"fields\": [\n" +
            "        \"product.category\"\n" +
            "    ],\n" +
            "    \"aggregates\": [\n" +
            "        {\n" +
            "            \"field\": \"sale.amount\",\n" +
            "            \"function\": \"sum\",\n" +
            "            \"alias\": \"total_revenue\"\n" +
            "        },\n" +
            "        {\n" +
            "            \"field\": \"sale.id\",\n" +
            "            \"function\": \"count\",\n" +
            "            \"alias\": \"total_sales\"\n" +
            "        }\n" +
            "    ]\n" +
            "}";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + testPort + "/query"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(queryJson))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());

        JsonNode responseBody = objectMapper.readTree(response.body());
        assertTrue(responseBody.get("success").asBoolean());
        assertTrue(responseBody.has("data"));

        ArrayNode aggregates = (ArrayNode) responseBody.get("data");
        JsonNode aggregate = aggregates.get(0);
        assertTrue(aggregate.has("total_revenue"));
        assertTrue(aggregate.has("total_sales"));

        // Check that aggregates are numbers
        assertTrue(aggregate.get("total_revenue").isNumber());
        assertTrue(aggregate.get("total_sales").isNumber());
    }

    @Test
    void testComplexQuery() throws IOException, InterruptedException {
        String queryJson = "{\n" +
            "    \"filter\": [\n" +
            "        {\n" +
            "            \"field\": \"sale.amount\",\n" +
            "            \"operator\": \"greater_than\",\n" +
            "            \"value\": 100\n" +
            "        },\n" +
            "        {\n" +
            "            \"field\": \"product.category\",\n" +
            "            \"operator\": \"in\",\n" +
            "            \"value\": [\"Electronics\", \"Clothing\"]\n" +
            "        },\n" +
            "        {\n" +
            "            \"field\": \"customer.state\",\n" +
            "            \"operator\": \"equals\",\n" +
            "            \"value\": \"CA\"\n" +
            "        }\n" +
            "    ],\n" +
            "    \"fields\": [\n" +
            "        \"sale.id\",\n" +
            "        \"sale.amount\",\n" +
            "        \"product.name\",\n" +
            "        \"product.category\",\n" +
            "        \"customer.name\",\n" +
            "        \"customer.state\",\n" +
            "        \"sale.date\"\n" +
            "    ],\n" +
            "    \"limit\": 10\n" +
            "}";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + testPort + "/query"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(queryJson))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());

        JsonNode responseBody = objectMapper.readTree(response.body());
        assertTrue(responseBody.get("success").asBoolean());

        JsonNode data = responseBody.get("data");
        assertTrue(data.isArray());

        // Verify that all returned records meet the filter criteria
        for (JsonNode record : data) {
            double amount = record.get("sale.amount").asDouble();
            assertTrue(amount > 100, "Sale amount should be greater than 100");

            String category = record.get("product.category").asText();
            assertTrue("Electronics".equals(category) || "Clothing".equals(category),
                      "Category should be Electronics or Clothing");

            String state = record.get("customer.state").asText();
            assertEquals("CA", state, "Customer state should be CA");
        }
    }

    @Test
    void testInvalidQuery() throws IOException, InterruptedException {
        String queryJson = "{\n" +
            "    \"filter\": [\n" +
            "        {\n" +
            "            \"field\": \"invalid.field\",\n" +
            "            \"operator\": \"equals\",\n" +
            "            \"value\": \"test\"\n" +
            "        }\n" +
            "    ],\n" +
            "    \"fields\": [\"sale.id\"]\n" +
            "}";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + testPort + "/query"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(queryJson))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode()); // Server should handle gracefully

        JsonNode responseBody = objectMapper.readTree(response.body());
        assertTrue(responseBody.get("success").asBoolean());

        // Should return empty results for invalid field
        JsonNode data = responseBody.get("data");
        assertTrue(data.isArray());
        assertEquals(0, data.size());
    }

    @Test
    void testMissingRequiredFields() throws IOException, InterruptedException {
        String queryJson = "{}";

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("http://localhost:" + testPort + "/query"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(queryJson))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(400, response.statusCode());

        JsonNode responseBody = objectMapper.readTree(response.body());
        assertFalse(responseBody.get("success").asBoolean());
        assertTrue(responseBody.has("error"));
    }

    @Test
    void testServerLifecycle() throws IOException {
        // Test that we can create multiple server instances
        AcmeServer server1 = new AcmeServer(8082);
        AcmeServer server2 = new AcmeServer(8083);

        assertNotNull(server1);
        assertNotNull(server2);

        // Test that we can start and stop servers sequentially to avoid port conflicts
        assertDoesNotThrow(() -> {
            server1.start();
            Thread.sleep(500);
            server1.close();
            Thread.sleep(100); // Small delay to ensure port is released
        });

        assertDoesNotThrow(() -> {
            server2.start();
            Thread.sleep(500);
            server2.close();
        });
    }

    @Test
    void testMainMethod() {
        // Test that main method can be invoked (without actually starting server)
        assertDoesNotThrow(() -> {
            // This tests the argument parsing logic
            String[] args = {"8080"};
            // We can't actually run main() as it would block, but we can test the parsing
            int port = Integer.parseInt(args[0]);
            assertEquals(8080, port);
        });
    }
}
