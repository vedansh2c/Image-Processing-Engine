import base64
import json
import struct
import zlib
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def png(width=2, height=1):
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind+payload))
    header = chunk(b"IHDR", struct.pack(">IIBBBBB", width,height,8,6,0,0,0))
    rows = (b"\x00" + bytes([255,0,0,17,0,255,0,99])) if width == 2 else b""
    return b"\x89PNG\r\n\x1a\n" + header + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")

def process(parameters=None, data=None):
    return client.post("/api/process", files={"image": ("input.png", data or png(), "image/png")},
                       data={"parameters": json.dumps(parameters or {})})

def test_health_and_system():
    assert client.get("/api/health").json()["engine"] == "C++17"
    assert len(client.get("/api/filters").json()) == 7
    assert "simd" in client.get("/api/system").json()

def test_real_native_processing():
    response = process({"filter": "invert", "mode": "optimized", "workers": 2})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["latency_ms"] > 0 and result["throughput_mp_s"] > 0
    assert result["workers"] == 2 and result["width"] == 2
    output = base64.b64decode(result["image_base64"])
    assert output.startswith(b"\x89PNG")
    # Inverting native PNG twice returns the same decoded input pixels.
    again = process({"filter": "invert", "mode": "sequential"}, output)
    expected = process({"filter": "adjust", "mode": "sequential"})
    assert again.json()["image_base64"] == expected.json()["image_base64"]

def test_validation_and_bombs():
    for params in ({"kernel": 4}, {"workers": 33}, {"sigma": -1}, {"filter": "bad"}, {"width": 8192,"height": 8192}, {"unexpected": 1}):
        assert process(params).status_code == 422
    assert process(data=b"invalid").status_code == 415
    assert process(data=png(8192,8192)).status_code == 422
    assert process(data=b"\x89PNG\r\n\x1a\n").status_code == 422
    assert client.post("/api/process", headers={"Content-Length": str(22*1024*1024)}).status_code == 413
    assert client.post("/api/process", data={"parameters": "{bad"}, files={"image": ("x", png())}).status_code == 422

def test_benchmark():
    response = client.post("/api/benchmark", json={"parameters": {"filter": "invert"}, "workers": [1,2], "iterations": 3})
    assert response.status_code == 200, response.text
    results = response.json()["results"]
    assert len(results) == 5
    assert results[0]["speedup"] == 1
    assert all(r["latency_ms"] > 0 and r["max_pixel_difference"] == 0 for r in results)
    assert client.post("/api/benchmark", json={"workers": [0]}).status_code == 422
    assert client.post("/api/benchmark", json={"resolutions": [[999999,999999]]}).status_code == 422

def test_repeated_concurrent_requests():
    def run(_):
        response = process({"filter": "gaussian", "workers": 2})
        assert response.status_code == 200, response.text
        return response.json()["image_base64"]
    with ThreadPoolExecutor(max_workers=2) as executor:
        outputs = list(executor.map(run, range(12)))
    assert len(set(outputs)) == 1


def test_busy_admission_control():
    from backend.app.main import slots
    assert slots.acquire(blocking=False)
    assert slots.acquire(blocking=False)
    try:
        assert process().status_code == 503
    finally:
        slots.release()
        slots.release()
    assert process().status_code == 200


def test_inflation_budget_and_recovery():
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind+payload))
    header = chunk(b"IHDR", struct.pack(">IIBBBBB", 1,1,8,6,0,0,0))
    hostile = b"\x89PNG\r\n\x1a\n" + header + chunk(b"IDAT", zlib.compress(bytes(20*1024*1024))) + chunk(b"IEND", b"")
    assert process(data=hostile).status_code == 422
    assert process().status_code == 200


def test_chunked_body_limit():
    response = client.post("/api/benchmark", content=iter([b" "*1024*1024]*22), headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_grayscale_input_normalization():
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind+payload))
    for color_type, pixel, channels in ((0, b"\x46", 3), (4, b"\x46\x11", 4)):
        image = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1,1,8,color_type,0,0,0))
        image += chunk(b"IDAT", zlib.compress(b"\x00"+pixel)) + chunk(b"IEND", b"")
        response = process(data=image)
        assert response.status_code == 200
        assert response.json()["channels"] == channels
    assert process(data=b"\xff\xd8bad JPEG").status_code == 422
    assert client.post("/api/benchmark", json={"workers": [True]}).status_code == 422
