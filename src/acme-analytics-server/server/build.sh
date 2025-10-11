#!/bin/bash

# Build script for ACME Analytics Server

set -e

echo "Building ACME Analytics Server..."

# Clean and compile
mvn clean compile

# Run tests
echo "Running tests..."
mvn test

# Package the application
echo "Packaging application..."
mvn package

echo "Build completed successfully!"
echo "Executable JAR: target/acme-analytics-server-1.0.0.jar"

# Optional: Build Docker image
if [ "$1" = "--docker" ]; then
    echo "Building Docker image..."
    docker build -t acme-analytics-server:latest .
    echo "Docker image built: acme-analytics-server:latest"
fi

echo ""
echo "Usage:"
echo "  java -jar target/acme-analytics-server-1.0.0.jar [port]"
echo "  docker run -p 8080:8080 acme-analytics-server:latest"
