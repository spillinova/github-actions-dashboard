# Use a multi-stage build to reduce the final image size
# Stage 1: Build the application
FROM python:3.11-alpine as builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev

# Install Python dependencies
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# Stage 2: Create the runtime image
FROM python:3.11-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache libstdc++

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH="/root/.local/bin:${PATH}"
ENV PYTHONPATH="/app:${PYTHONPATH}"

# Create necessary directories and set proper permissions
RUN mkdir -p /app/static /app/templates && \
    chown -R 1000:1000 /app

# Copy application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
