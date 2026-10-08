FROM python:3.12-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends g++ cmake make && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r /tmp/requirements.txt && pip install --no-cache-dir pybind11==3.1.0
COPY engine ./engine
RUN cmake -S engine -B build -DCMAKE_BUILD_TYPE=Release -DPF_BUILD_TESTS=OFF -DPython_EXECUTABLE=/usr/local/bin/python && cmake --build build -j 2 && cmake --install build --prefix /native
FROM python:3.12-slim AS runtime
RUN useradd --create-home --uid 10001 image-engine
COPY --from=builder /install /usr/local
COPY --from=builder /native /usr/local/lib/python3.12/site-packages
WORKDIR /app
COPY backend/app ./app
USER image-engine
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=2)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "16"]
