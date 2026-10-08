# Image Processing Engine progress

## Architecture decisions

- C++17 owns all image algorithms and native benchmarking; stb is used only for PNG/JPEG codec operations.
- Each native request owns its processor and reusable worker pool. No global image/options state.
- Filters preserve alpha and dimensions except resize; borders replicate edges. Straight-alpha resize and encoded-RGB math are documented.
- Optimized Gaussian is separable with double intermediate values; inversion uses ARM64 NEON / x86-64 SSE2 baseline instructions with scalar fallback.
- FastAPI uses pybind11 directly with the GIL released and bounded POST admission. API response is base64 PNG JSON plus native metrics.
- React provides a responsive workspace and separate real benchmark lab. Docker exposes only the Nginx frontend on localhost:3000.

## Implementation

Core engine, all seven filters, codecs, reusable convolution, thread pool, optimized paths, benchmark executable, bindings, API, workspace, dashboard, Dockerfiles, Compose, CI and technical documentation are implemented.

## Verification (2026-10-08)

- ARM64 Apple M4 / macOS, AppleClang 21 release build: 12 GoogleTest cases passed.
- ASan + UBSan debug build: all 12 tests passed; no reported findings.
- Native API tests with Python 3.14.6: 9 passed, including concurrent requests, oversized/chunked input, malformed images, dimension bombs, bounded deflate allocation and admission control.
- TypeScript check and Vite production build passed.
- Actual Gaussian and inversion native CSV benchmarks recorded; hardware, methodology and results are in benchmarks/.
- Docker Compose built and both services reached healthy status on ARM64 Linux / Python 3.12.15. Full application is served through Nginx at localhost:3000.
- Playwright Chromium: 3 integration tests passed across all filters and execution modes, PNG/JPEG decoding, PNG output/download and file signatures, real benchmark charts/JSON export and mobile layout. Desktop/lab/mobile screenshots captured and visually reviewed.
- ThreadSanitizer debug build: all 12 native tests passed with no reported races.

## Remaining verification / limitations

- Native x86-64 validation still requires a separate target. Code/CI configuration is not a claim that hosted CI has run.
- No statistical confidence intervals, cancellation, persistent pool sharing, premultiplied-alpha resize, antialias prefilter or binary streaming.
- Timings depend on hardware load, compiler, resolution and worker count. No unmeasured GPU/DSP acceleration is claimed.

## Project naming

The project is named Image Processing Engine. Native targets, include paths, Python extension imports, UI branding, download names, package metadata and Compose configuration use the generic name.

Naming verification: rebuilt native targets and extension, 12 C++ tests and 9 API tests passed, frontend production build passed, and renamed Compose services rebuilt and healthy. All 3 browser tests passed with the new page title; screenshots regenerated.
