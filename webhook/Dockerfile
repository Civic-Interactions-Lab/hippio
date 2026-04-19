FROM python:3.12-slim

# Install Docker CLI and git so deploy.sh can use them
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates curl git openssh-client docker.io && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py deploy.sh ./
RUN chmod +x deploy.sh

EXPOSE 9000

# Run with gunicorn for a production-grade server (1 worker, threaded)
CMD ["gunicorn", "-b", "0.0.0.0:9000", "--threads", "4", "--timeout", "10", "app:app"]


