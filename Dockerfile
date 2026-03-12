FROM python:3.12-slim

WORKDIR /app

# Build tools for hdbscan C extensions
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt flask flask-cors

# Copy application
COPY . .

# Run API server
CMD ["python", "api_server.py"]
