# syntax=docker/dockerfile:1
FROM python:3.13-slim
WORKDIR /app
COPY apps/api/requirements.txt ./requirements.txt
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.txt
COPY apps/api/ ./
COPY packages/security/ /app/packages/security/
ENV PYTHONPATH=/app:/app/packages/security
RUN chmod -R a+rX /app && useradd --system --uid 10001 bmp
USER 10001
EXPOSE 8000
CMD ["uvicorn", "bmp.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--ws-max-size", "1048576"]
