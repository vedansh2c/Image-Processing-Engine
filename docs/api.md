# API contract

API paths are same-origin behind Nginx in Docker. In local development the backend listens on localhost:8000. `/docs` exposes the FastAPI OpenAPI UI directly on the local backend.

## Read endpoints

- `GET /api/health`: status, native engine language, application version. Import failure prevents startup; there is no Python fallback.
- `GET /api/filters`: supported filter IDs, names and descriptions.
- `GET /api/system`: logical CPU count, compiled SIMD path, OS/architecture/Python version, limits and supported resolutions. OS logical CPU count is not a measured CPU quota or model name.

## Process

`POST /api/process`, multipart form with `image` (PNG/JPEG bytes) and `parameters` (JSON string).

```bash
curl http://localhost:3000/api/process \
  -F 'image=@your-image.png' \
  -F 'parameters={"filter":"gaussian","mode":"optimized","workers":4,"kernel":5,"sigma":1.4}' \
  -o response.json
```

Parameter defaults and ranges:

| Name | Default | Validation |
| --- | --- | --- |
| filter | grayscale | grayscale, adjust, gaussian, sobel, sharpen, resize, invert |
| mode | optimized | sequential, multithreaded, optimized |
| workers | 4 | Integer 1…32; actual worker count is 1 for sequential |
| kernel | 5 | Odd integer 1…31 |
| sigma | 1.4 | Finite 0.1…20 |
| brightness | 0 | Finite −255…255 |
| contrast | 1 | Finite 0…4 |
| width, height | 640, 480 | Integer 1…8192; area ≤16×1024×1024 |
| interpolation | bilinear | nearest or bilinear |

Unknown keys are rejected. Parameters are validated consistently even when the selected filter ignores them. Filter-specific values take effect only on that filter.

Successful JSON response fields:

| Field | Meaning |
| --- | --- |
| image_base64 | Encoded PNG as base64, without a data URL prefix |
| mime_type | image/png |
| width, height, channels | Output dimensions and RGB/RGBA channel count |
| mode, workers | Actual execution settings |
| latency_ms | A single native filter application, including output/scratch allocation |
| throughput_mp_s | Input megapixels / native seconds |
| speedup | null; the frontend derives a single-run speedup only from a matching sequential result |
| request_ms | Handler decode/pool/process/encode/base64 time; excludes body parsing, response serialization and transport |

Render using `data:image/png;base64,${image_base64}` or decode into a binary file. All timings are real measured values. Process has no extra baseline pass hidden in its reported latency.

## Benchmark

`POST /api/benchmark`, JSON:

```json
{
  "parameters": {"filter": "gaussian", "kernel": 5, "sigma": 1.4},
  "resolutions": [[640,480], [1280,720]],
  "workers": [1,2,4],
  "iterations": 5
}
```

Resolutions must be a unique subset of 640×480, 1280×720, 1920×1080 and 3840×2160. Choose 1…4 unique integer worker counts in 1…32. Iterations must be 3…15. Each selected resolution has one sequential baseline and a multithreaded/optimized row for each worker count. The request's `parameters.mode` and `parameters.workers` are ignored by the suite; it always measures all three modes using its `workers` list.

Response: `results` array, system configuration, iterations, warmup count, filter/options snapshot, request time and methodology. Each result has dimensions, mode, workers, median `latency_ms`, `min_ms`, `max_ms`, throughput, matched speedup, checksum (decimal string to preserve 64-bit precision), full-output `max_pixel_difference`, `stable` and `comparison_reliable`. These final booleans describe the ≤20% spread / non-overlapping range heuristic; they do not imply statistical significance. Synthetic inputs are generated in C++; uploads are not used for the lab.

## Limits and errors

- File: ≤20 MiB. Aggregate ASGI body: ≤20 MiB + 64 KiB; this includes form headers and parameters. Nginx uses a 21 MiB outer limit.
- Input/output: ≤8192 per side, area ≤16×1024×1024 pixels. Dimension inspection precedes full decoding.
- Decoder live allocation limit: `min(256 MiB, 8 MiB + 4×output bytes)`, independently per decoding thread.
- Workers: 1…32 per accepted request. Two POST slots per Uvicorn process; no unbounded waiting queue.
- Benchmark work estimate is capped; reduce kernel, suite sizes, counts or iterations if rejected.
- 400: malformed HTTP/body. 413: oversized upload/body. 415: unsupported format. 422: invalid options, dimensions or malformed supported image. 503: busy engine or native resource failure.
- Errors use JSON `detail` (string or FastAPI validation array). Nginx's own errors can be HTML; frontend handles non-JSON errors with their HTTP status.

This application is designed for a trusted local demonstration. Do not expose an unauthenticated computational API on the public internet without additional service controls.
