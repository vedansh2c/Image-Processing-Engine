# Measured native benchmarks

Measured on 2026-10-08 on Apple M4 / macOS ARM64 using AppleClang 21, Release configuration. These are actual observations, not performance promises. Exact hardware, input and configuration are in [hardware-arm64.json](hardware-arm64.json). Both CSV files include all four required resolutions, sequential mode and 1/2/4/8-worker parallel/optimized modes. Full-output equivalence checks ran before measurements.

Gaussian: RGB, kernel 5×5, sigma 1.4; two warm-ups and median of five timed iterations. Allocation is included; codecs, thread creation, correctness checking and transport are excluded.

| Resolution | Sequential ms | Parallel (4) ms | Optimized (4) ms | Optimized speedup | Optimized min–max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 640×480 | 12.29 | 3.22 | 1.42 | 8.67× | 1.42–1.43 |
| 1280×720 | 37.25 | 9.60 | 3.74 | 9.96× | 3.66–4.30 |
| 1920×1080 | 83.91 | 21.61 | 8.23 | 10.19× | 8.17–8.30 |
| 3840×2160 | 341.14 | 96.37 | 33.76 | 10.11× | 33.52–34.17 |

The local machine was not isolated from other development activity; no affinity or frequency locking was applied. Some timing ranges are wide, so use the raw min/max and repeated suites rather than selecting the highest speedup. The optimized Gaussian reduces arithmetic from K² to 2K taps but adds a double intermediate buffer; this explains why allocation and cache effects matter even with separability. Inversion has lower arithmetic intensity and can be limited by memory bandwidth or scheduling overhead; SIMD is not a guarantee of improvement.

- [gaussian-arm64.csv](gaussian-arm64.csv)
- [invert-arm64.csv](invert-arm64.csv)

Reproduce after building: `build/image_processing_engine_bench gaussian 5` or `build/image_processing_engine_bench invert 5`. Changing input/filter/threads changes the result. Native x86-64 timings have not been measured here; Docker/emulator measurements must not be presented as native x86 performance.
