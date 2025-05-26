#!/bin/bash
set -e

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"
SERVICE_NAME="github-actions-dashboard"
HEALTH_CHECK_URL="http://localhost:8000/health"
MAX_RETRIES=10
RETRY_DELAY=5

# Function to check container health
check_health() {
    local container_id=$1
    local max_retries=$2
    local retry_delay=$3
    
    echo "Waiting for container to be healthy..."
    
    for ((i=1; i<=max_retries; i++)); do
        health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_id" 2>/dev/null || echo "starting")
        
        if [ "$health_status" = "healthy" ]; then
            echo "Container is healthy!"
            return 0
        elif [ "$health_status" = "unhealthy" ]; then
            echo "Container is unhealthy!"
            docker logs "$SERVICE_NAME" --tail 50
            return 1
        fi
        
        echo "Waiting for container to be healthy (attempt $i/$max_retries)..."
        sleep "$retry_delay"
    done
    
    echo "Container failed to become healthy after $max_retries attempts"
    docker logs "$SERVICE_NAME" --tail 50
    return 1
}

# Main deployment
echo "=== Starting deployment ==="

# Stop and remove existing containers
echo "Stopping and removing existing containers..."
docker-compose -f "$DOCKER_COMPOSE_FILE" down -v --remove-orphans || true

# Clean up unused resources
echo "Cleaning up unused resources..."
docker system prune -f

# Pull the latest image
echo "Pulling the latest image..."
echo "$GITHUB_TOKEN" | docker login ghcr.io -u spillinova --password-stdin
docker-compose -f "$DOCKER_COMPOSE_FILE" pull

# Start the services
echo "Starting services..."
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

# Get container ID
CONTAINER_ID=$(docker ps -qf "name=$SERVICE_NAME")

if [ -z "$CONTAINER_ID" ]; then
    echo "Error: Failed to find container for service $SERVICE_NAME"
    exit 1
fi

# Check container health
if ! check_health "$CONTAINER_ID" "$MAX_RETRIES" "$RETRY_DELAY"; then
    echo "Error: Deployment failed - container did not become healthy"
    exit 1
fi

# Verify health check endpoint
echo -e "\n=== Verifying health check endpoint ==="
HEALTH_CHECK_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL")

if [ "$HEALTH_CHECK_RESPONSE" != "200" ]; then
    echo "Error: Health check failed with status code $HEALTH_CHECK_RESPONSE"
    docker logs "$SERVICE_NAME" --tail 50
    exit 1
fi

echo -e "\n=== Deployment completed successfully! ==="
echo "Service is now available at http://localhost:8000"
