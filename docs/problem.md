# Project: Image Processing Engine — High-Performance Image Processing Engine

Act as a senior C++ systems engineer, computer vision engineer, and full-stack developer. Build a complete, production-quality, portfolio-ready project called **Image Processing Engine**, a high-performance image processing engine with an interactive web interface.

This project is intended for a Qualcomm Software Engineer resume, so prioritize C++, operating systems, multithreading, CPU optimization, memory management, multimedia processing, and software architecture.

Do not build a superficial image-filtering demo. Build a genuine C++ processing engine with measurable performance improvements, a polished web UI, automated tests, and Docker-based portability.

## 1. Technology Stack

**Core Engine**
- C++17
- CMake
- Standard Template Library
- std::thread, std::mutex, std::condition_variable
- stb_image and stb_image_write for image decoding/encoding only
- GoogleTest for C++ unit testing
- Optional ARM NEON and x86 SIMD optimizations

**Backend**
- Python 3.12
- FastAPI
- pybind11 to expose C++ functionality to Python
- Pydantic for request validation

**Frontend**
- React + TypeScript + Vite
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Recharts for performance visualization

**Infrastructure**
- Docker
- Docker Compose
- Multi-stage Docker builds
- GitHub Actions CI

Do not use OpenCV, Pillow, or other image processing libraries to implement the actual algorithms. The C++ engine must perform all pixel-level processing.

## 2. Core Image Processing Engine

Implement the following operations from scratch in C++:

1. Grayscale conversion using luminance-weighted RGB values.
2. Brightness and contrast adjustment.
3. Gaussian blur using configurable kernel size and sigma.
4. Sobel edge detection using horizontal and vertical gradient kernels.
5. Image sharpening using convolution.
6. Image resizing using nearest-neighbor and bilinear interpolation.
7. Image inversion.

Create a reusable Image class that owns its pixel buffer safely using RAII and std::vector<uint8_t>.

Support RGB and RGBA input images. Define clear behavior for alpha channels, borders, and output dimensions.

Each filter must have a clean interface and be independently testable.

Implement a reusable convolution utility rather than duplicating convolution logic across filters.

## 3. Multithreading and CPU Optimization

This is the most important engineering component.

Implement three execution modes:

**Mode A — Sequential**
- Single-threaded baseline implementation.
- Straightforward, readable algorithms.

**Mode B — Multithreaded**
- Implement a reusable C++ thread pool.
- Use a thread-safe task queue, mutexes, and condition variables.
- Divide images into independent row ranges or tiles.
- Handle convolution boundaries correctly.
- Support configurable worker counts.
- Avoid spawning new threads for every small task.
- Implement clean shutdown and exception propagation.

**Mode C — Optimized**
- Implement cache-aware processing where beneficial.
- Minimize unnecessary allocations and memory copies.
- Optimize separable Gaussian convolution using horizontal and vertical passes.
- Add SIMD acceleration for at least one suitable operation when feasible.
- Use compile-time feature detection and runtime capability checks where needed.
- Provide a portable fallback implementation.

Do not label a mode optimized unless it contains a real optimization.

Support ARM64 and x86-64 where practical. Keep architecture-specific code isolated.

## 4. Performance Benchmarking

Build a reliable benchmarking module in C++.

Measure:
- Processing latency in milliseconds.
- Throughput in megapixels per second.
- Speedup relative to sequential execution.
- Performance across different image resolutions.
- Performance across different thread counts.
- Performance of sequential, multithreaded, and optimized implementations.

Benchmark resolutions:
- 640 × 480
- 1280 × 720
- 1920 × 1080
- 3840 × 2160

Use std::chrono::steady_clock for timing.

Perform warm-up runs followed by multiple measured iterations. Report median execution time.

Exclude image upload, network transfer, decoding, encoding, and frontend rendering from core engine benchmarks.

Provide separate end-to-end request timing if useful.

Prevent compiler optimization from invalidating benchmark results.

Avoid misleading comparisons. Ensure each mode processes equivalent inputs and produces equivalent outputs within documented numerical tolerances.

Do not invent performance results.

## 5. Interactive Web UI

Build a polished, responsive interface suitable for a technical portfolio demonstration.

Use a modern developer-tool aesthetic with dark mode, restrained colors, clear typography, and professional spacing.

### Main Workspace

**Left Panel — Controls**
- Image upload using drag-and-drop.
- Image metadata: resolution, format, file size.
- Filter selection.
- Dynamic filter parameter controls.
- Execution mode selection.
- Worker thread count.
- Process button.
- Reset button.

**Center Panel — Image Preview**
- Original image.
- Processed image.
- Interactive before/after comparison slider.
- Zoom and fit controls.
- Download processed image.
- Loading and error states.

**Right Panel — Performance**
- Processing latency.
- Throughput in MP/s.
- Speedup compared with sequential execution.
- Worker count.
- Performance comparison chart.
- Benchmark history for the current session.

### Benchmark Dashboard

Create a separate benchmark section containing:
- Latency comparison bar chart.
- Thread scaling chart.
- Resolution scaling chart.
- Sequential vs multithreaded vs optimized comparisons.
- Benchmark configuration and hardware information.

The UI should explain when a comparison is unavailable or statistically unreliable.

Do not display fake benchmark measurements.

### Additional UX Requirements

- Responsive layout.
- Sensible upload size limits.
- Friendly validation errors.
- Accessible buttons and controls.
- Smooth but restrained animations.
- No unnecessary authentication, database, or external cloud dependencies.

## 6. Backend and C++ Integration

Use pybind11 to expose the native C++ engine.

The backend must call the compiled C++ module directly.

Implement APIs such as:

- GET /api/health
- GET /api/filters
- POST /api/process
- POST /api/benchmark
- GET /api/system

The processing endpoint should accept an uploaded image and validated filter parameters.

Return:
- Processed image.
- Processing time.
- Execution mode.
- Worker count.
- Image dimensions.
- Relevant performance metrics.

Choose a clear API response format and document it.

Validate input dimensions, file size, supported formats, kernel sizes, sigma values, and thread counts.

Handle malformed and decompression-bomb images safely.

Avoid global mutable processing state that can cause race conditions between requests.

## 7. Docker Portability

Containerize the complete application.

Provide:
- Multi-stage Dockerfile for the C++/FastAPI backend.
- Dockerfile for the React frontend.
- docker-compose.yml.
- .dockerignore.
- Environment configuration examples.

The entire project must start with:

```bash
docker compose up --build
```

Expose the web UI on:

http://localhost:3000

Use an internal Docker network for backend communication and configure the frontend to proxy API requests correctly.

Ensure the native C++ extension is compiled for the container's target architecture.

Support Docker on Apple Silicon ARM64 and x86-64 systems without assuming the same SIMD instructions exist everywhere.

Do not require GPU access, paid services, or external APIs.

## 8. Project Structure

Use a clean modular structure similar to:

```text
image_processing_engine/
├── engine/
│   ├── include/
│   ├── src/
│   │   ├── core/
│   │   ├── filters/
│   │   ├── parallel/
│   │   ├── optimization/
│   │   └── benchmark/
│   ├── bindings/
│   ├── tests/
│   └── CMakeLists.txt
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── schemas/
│   │   └── services/
│   ├── tests/
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── services/
│   └── Dockerfile
├── benchmarks/
├── docs/
├── .github/workflows/
├── docker-compose.yml
├── README.md
└── AGENTS.md
```

Adjust the structure if a simpler design is technically better. Avoid unnecessary abstraction.

## 9. Testing and Correctness

Implement automated tests for:
- Image dimensions and channel handling.
- Grayscale conversion.
- Convolution correctness.
- Gaussian blur.
- Sobel edge detection.
- Bilinear interpolation.
- Border handling.
- Multithreaded vs sequential output equivalence.
- Invalid input handling.
- Thread pool shutdown.
- Repeated processing and concurrent requests.

Use deterministic synthetic test images and small reference cases with known expected outputs.

Run sanitizers where supported.

Test that different thread counts produce correct output without data races.

Provide backend API tests and frontend build validation.

## 10. Documentation

Write a professional README containing:
- Project overview.
- Architecture diagram.
- Supported algorithms.
- Build and run instructions.
- Docker instructions.
- Performance methodology.
- Benchmark results when actually measured.
- Screenshots or instructions for capturing them.
- Technical tradeoffs.
- Limitations.
- Future improvements.

Add a dedicated ENGINEERING.md explaining:
- C++ memory ownership.
- Thread pool design.
- Task partitioning.
- Cache locality.
- SIMD architecture decisions.
- Thread safety.
- Benchmark methodology.
- Why particular optimizations improve or fail to improve performance.

This documentation should make the project easy to discuss in a Qualcomm technical interview.

## 11. Implementation Order

Work incrementally in these phases.

**Phase 1 — Core engine**
Implement image representation, decoding/encoding, grayscale, blur, Sobel, resizing, and unit tests.

**Phase 2 — Parallel engine**
Implement the thread pool, multithreaded execution, correctness tests, and benchmarks.

**Phase 3 — Optimization**
Implement separable convolution, memory optimizations, and architecture-specific SIMD where feasible.

**Phase 4 — Backend**
Create pybind11 bindings and FastAPI endpoints. Test actual native execution.

**Phase 5 — Frontend**
Implement the complete interactive image processing workspace and benchmark dashboard.

**Phase 6 — Docker**
Containerize all components and verify the complete application works through Docker Compose.

**Phase 7 — Final verification**
Run tests, perform real benchmarks, verify frontend/backend integration, and finalize documentation.

## 12. Important Engineering Rules

1. Write real working code, not pseudocode.
2. Do not leave placeholder implementations or TODO-only functionality.
3. Do not silently substitute Python implementations for C++ algorithms.
4. Keep the engine independently usable without the frontend.
5. Prioritize correctness before optimization.
6. Keep the architecture simple enough for one developer to understand and explain.
7. Avoid unnecessary microservices, databases, authentication, and cloud infrastructure.
8. Do not fabricate benchmark numbers or claim speedups without measurements.
9. Do not claim GPU, DSP, Hexagon, or Snapdragon-specific acceleration unless actually implemented and tested.
10. If a feature cannot be completed reliably, clearly document the limitation instead of pretending it works.
11. Keep AGENTS.md and docs/progress.md updated with architecture decisions, completed work, and remaining tasks.
12. Run relevant tests after each phase and fix failures before continuing.

## 13. Definition of Done

The project is complete only when:

- A user can upload an image through the browser.
- A user can select and configure filters.
- The C++ engine performs the actual processing.
- The processed image appears in the browser.
- The user can download the output.
- Sequential and multithreaded execution work correctly.
- Performance metrics come from actual measurements.
- The benchmark dashboard displays meaningful comparisons.
- The project starts with `docker compose up --build`.
- Automated tests pass.
- The README contains accurate instructions and documented limitations.

Start by inspecting the existing repository, if any. Then establish the architecture, implement the project phase by phase, and verify each major component.

Make reasonable technical decisions independently. Do not repeatedly ask for confirmation on minor implementation details.

The final result should be a polished, demonstrable, technically credible C++ systems project suitable for a Qualcomm Software Engineer resume.