import base64
import platform
import threading
import time
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from starlette.responses import JSONResponse
import image_processing_engine_native as native
from .schemas import Parameters, BenchmarkRequest, RESOLUTIONS

app = FastAPI(title="Image Processing Engine", version="1.0.0")
MAX_UPLOAD = 20 * 1024 * 1024
MAX_BODY = MAX_UPLOAD + 64 * 1024
# Admission control only; each accepted request owns its native buffers and pool.
slots = threading.BoundedSemaphore(2)

class LimitsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await JSONResponse({"detail": "Invalid Content-Length"}, 400)(scope, receive, send)
        if length > MAX_BODY:
            return await JSONResponse({"detail": "Upload exceeds 20 MiB"}, 413)(scope, receive, send)
        if not slots.acquire(blocking=False):
            return await JSONResponse({"detail": "Engine is busy. Try again shortly."}, 503)(scope, receive, send)
        total = 0
        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get("body", b""))
            if total > MAX_BODY:
                raise HTTPException(413, "Upload exceeds 20 MiB")
            return message
        try:
            await self.app(scope, limited_receive, send)
        finally:
            slots.release()

app.add_middleware(LimitsMiddleware)

FILTERS = [
    {"id": "grayscale", "name": "Grayscale", "description": "Rec. 709 weighted luminance"},
    {"id": "adjust", "name": "Brightness / contrast", "description": "Linear transform around 127.5"},
    {"id": "gaussian", "name": "Gaussian blur", "description": "Normalized Gaussian with clamped borders"},
    {"id": "sobel", "name": "Sobel edges", "description": "Luminance gradient magnitude"},
    {"id": "sharpen", "name": "Sharpen", "description": "3 × 3 convolution"},
    {"id": "resize", "name": "Resize", "description": "Nearest or bilinear interpolation"},
    {"id": "invert", "name": "Invert", "description": "RGB complement; alpha preserved"},
]

def options(parameters):
    result = native.Options()
    for name, value in parameters.model_dump(exclude={"mode", "workers"}).items():
        setattr(result, name, value)
    return result

@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "C++17", "version": "1.0.0"}

@app.get("/api/filters")
def filters():
    return FILTERS

@app.get("/api/system")
def system():
    return {**native.system(), "architecture": platform.machine(), "platform": platform.system(),
            "python": platform.python_version(), "max_upload_bytes": MAX_UPLOAD,
            "max_pixels": 16*1024*1024, "resolutions": RESOLUTIONS,
            "optimizations": {"gaussian": "separable convolution", "invert": "SIMD where supported"}}

@app.post("/api/process")
def process(image: UploadFile = File(...), parameters: str = Form("{}")):
    start = time.perf_counter()
    if len(parameters) > 4096:
        raise HTTPException(422, "Parameters are too large")
    try:
        parsed = Parameters.model_validate_json(parameters)
    except ValidationError as exc:
        raise HTTPException(422, "; ".join(e["msg"] for e in exc.errors())) from exc
    payload = image.file.read(MAX_UPLOAD + 1)
    if len(payload) > MAX_UPLOAD:
        raise HTTPException(413, "Upload exceeds 20 MiB")
    if not (payload.startswith(b"\x89PNG\r\n\x1a\n") or payload.startswith(b"\xff\xd8")):
        raise HTTPException(415, "Please upload a PNG or JPEG image")
    try:
        result = native.process(payload, options(parsed), parsed.mode, parsed.workers)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (RuntimeError, MemoryError) as exc:
        raise HTTPException(503, "Engine could not allocate processing resources") from exc
    png = result.pop("png")
    result.update(image_base64=base64.b64encode(png).decode("ascii"), mime_type="image/png",
                  speedup=None, request_ms=(time.perf_counter()-start)*1000)
    return result

@app.post("/api/benchmark")
def benchmark(request: BenchmarkRequest):
    start = time.perf_counter()
    try:
        results = native.benchmark(options(request.parameters), request.resolutions, request.workers, request.iterations)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (RuntimeError, MemoryError) as exc:
        raise HTTPException(503, "Engine could not complete benchmark") from exc
    for row in results:
        baseline = next(r for r in results if r["mode"] == "sequential" and r["width"] == row["width"] and r["height"] == row["height"])
        row["comparison_reliable"] = row["stable"] and baseline["stable"] and (
            row["mode"] == "sequential" or row["max_ms"] < baseline["min_ms"] or row["min_ms"] > baseline["max_ms"])
    return {"results": results, "system": system(), "iterations": request.iterations, "warmup": 2,
            "filter": request.parameters.filter, "parameters": request.parameters.model_dump(),
            "request_ms": (time.perf_counter()-start)*1000,
            "methodology": "Median native latency; decode, encode, transport and pool creation excluded. Allocation included. Overlapping min/max ranges are inconclusive, not a significance test."}
