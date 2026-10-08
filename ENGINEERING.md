# Engineering decisions

## Ownership and invariants

`Image` owns a contiguous interleaved RGB/RGBA `std::vector<uint8_t>`; dimensions are checked before multiplication or allocation. Copy/move semantics follow the rule of zero. Public buffer editing is useful for native clients and tests, so public operations revalidate dimensions, channel counts and buffer size before accessing memory. The caller must not mutate an input while processing it. Filters read one immutable input and return a separately owned output; outputs cannot alias input storage.

stb buffers use `unique_ptr` with the matching decoder/encoder deleter. PNG/JPEG headers are inspected before full decoding. Both axes are limited to 8192 and area to 16×1024×1024 pixels. Limiting IHDR dimensions is insufficient for malicious deflate data. Decoder allocation callbacks therefore track live allocation bytes in thread-local state, with a per-image limit `min(256 MiB, 8 MiB + 4 × output bytes)`. Allocation failure returns a decoder error. Reallocation updates the counter only on success; a scope guard restores the budget. Each decoding buffer is freed on the same thread that allocated it. The budget covers decoder allocations, not STL input/output buffers or encoding; API and container limits complement it.

Convolution uses double accumulation with one final rounding step. Borders clamp to the nearest valid coordinate. Preserving alpha prevents ordinary RGB filters from changing image coverage. Resize samples every channel, including alpha, with documented straight-alpha behavior. Color-profile processing is deliberately outside this engine's current scope.

## Thread pool and lifetime

`ThreadPool` creates 1…32 workers once. Workers wait on a condition variable guarded by a mutex and take `std::function<void()>` tasks from a FIFO queue. Tasks run outside the queue lock. A shared `packaged_task` makes move-only future results compatible with the queue, and exceptions reach the caller through `future::get()`.

Shutdown sets a stop flag under the mutex, wakes every worker, drains queued tasks, and joins all threads. Constructor failure also stops and joins already-created workers. `Processor::rows` schedules one contiguous stripe per worker, then waits for **every** future, even if submission or a task fails. Only after all outstanding references are safe does it rethrow the first exception. This avoids dangling captures into stack-owned input, output, and kernel data.

Partition boundaries are `i × height / n` to `(i + 1) × height / n` where `n=min(workers,height)`. Every output row has exactly one writer. Convolution halo reads go into the original full input, not a stripe-local copy, so there are no tile seams. Stripes share read-only kernel/input data. A Gaussian horizontal/vertical barrier ensures the intermediate image is complete before vertical reads begin. There is no output mutex in hot loops.

For sequential mode no pool is created. Parallel modes reuse their workers over filters and repetitions within a request; requests own separate processors. This trades pool-creation overhead in end-to-end timing for simple ownership and clean resource limits. Tiny images can be slower in parallel mode. Oversubscribing logical CPUs often hurts throughput; the lab lets the user measure rather than assume a best count.

## Cache locality and optimization

Rows are traversed in increasing order in interleaved memory. Adjacent output pixels share input cache lines; output writes are contiguous. Kernels are constructed once per application, not once per pixel. Filter/interpolation dispatch is resolved before pixel loops to avoid artificial string-comparison overhead in the baseline. No intermediate stripe copies or per-pixel allocations occur. General convolution is reused by blur and sharpen.

The baseline Gaussian evaluates a K×K outer-product kernel, costing O(W H K²) per channel. Optimized Gaussian uses normalized horizontal/vertical 1D weights and costs O(W H K), with a double-precision RGB intermediate. Rounding happens after the second pass, so double accumulation order can create at most one byte of documented disagreement. The scratch image excludes alpha because alpha is simply copied. Vertical access is less cache-friendly than horizontal access, and zeroing/allocating the double intermediate is measurable. Consequently, a small kernel or memory-bound workload may not improve as much as arithmetic counts imply. Cache blocking the vertical pass is future work, not a current performance claim.

Inversion's optimized path scans contiguous rows in 16-byte vectors, then uses a scalar tail. ARM64 uses NEON `vmvnq_u8`; x86-64 uses SSE2 XOR with `0xff`. No unaligned load assumption is required. RGBA vector processing inverts bytes, then restores alpha in a scalar pass. For RGB there is no alpha restoration. SSE2 is mandatory on x86-64 and NEON on ARM64, so baseline architecture checks suffice; no AVX/optional-ISA dispatch or unsafe `-march=native` is used. Other targets compile a portable scalar scan. An additional runtime feature check would be necessary before adding AVX2 or other optional instructions.

Compiler auto-vectorization can already help the baseline, and inversion quickly becomes memory-bandwidth-bound. SIMD must be judged against actual timings, not assumed faster. `simd_name()` reports the compiled implementation; it does not claim Qualcomm DSP, Hexagon, Snapdragon, or GPU acceleration. Optimized mode's other filters reuse the parallel kernels and are disclosed as such.

## Python integration and request safety

pybind11 releases the GIL around decode/process/encode and benchmark work. No Python objects are accessed within that scope. Options are copied before release so an external Python caller cannot race native reads by mutating the original Options object. Each call owns its C++ input, output, scratch buffers, options copy, and pool. The backend validates parameters with Pydantic before native processing. The native API validates them independently for standalone clients.

A middleware semaphore bounds POST admission to two simultaneous requests. Excess work receives 503 without starting a decoder or pool. The semaphore is resource admission state, not shared image processing state. An ASGI receive wrapper limits aggregate body bytes, including chunked transfer; declared lengths are rejected early. Multipart file reads also enforce 20 MiB. Supported format signatures are checked and stb supplies authoritative decoded dimension validation. Nginx limits request bodies to 21 MiB. One Uvicorn process keeps the admission bound predictable; multiple Uvicorn workers would multiply it.

No uploaded data is persisted by the application. Multipart buffering can spool uploads to temporary storage; managed uploads are closed by the framework. Results are base64 PNG JSON for a simple self-contained API. Binary streaming would reduce copies and memory; it is a documented next step. Resource exhaustion is surfaced as a service error, while a container memory limit remains the final guard against uncontrolled process memory.

## Benchmarks and interpretation

`steady_clock` avoids wall-clock adjustments. Each configuration warms up twice and runs a selectable 3…15 measured iterations. Median handles isolated long scheduling interruptions better than a single sample. Min/max is reported to show spread. Output lifetime extends beyond the timer, so allocation and computation are included, while output checksum traversal and destruction are outside the interval. Pools, synthetic input generation, correctness comparisons, codecs, transport and plotting are excluded. A consumed returned checksum provides an observable use of results; the CLI prints it.

Every mode sees equivalent inputs. Before measurement, the native benchmark compares the entire output against sequential output. Tolerance is one intensity level for Gaussian and zero otherwise. Speedup divides the matching baseline median by the measured median, not by a historical run or different image. Throughput always uses input area, even for resizing, so output-dimension changes must be considered when interpreting it.

The endpoint rejects overly expensive suite configurations using a conservative work estimate; this is admission control, not timing prediction. Resolution/thread charts are generated only from actual results. A single resolution/count cannot demonstrate scaling, and the UI explains that. Workspace history contains single-run samples and distinguishes them from repeated lab measurements. The lab's max/min and overlap rule is descriptive, not a confidence interval or hypothesis test. Thread scaling and algorithmic optimization need to be discussed alongside scratch allocation, cache behavior, scheduler variance and memory bandwidth.

## Verification and interview discussion

Known small fixtures test exact luminance, alpha, a hand-computed clamped convolution, a Gaussian impulse, Sobel ramp gradients and pixel-center bilinear interpolation. Larger deterministic fixtures compare every filter for RGB/RGBA across 1, 2, 4 and 32 workers, including SIMD tails. Pool tests verify exception propagation and draining. API tests call the actual extension and exercise malformed files, excessive dimensions, inflated streams, chunked body limits, admission recovery, repetitions and concurrent requests. ASan/UBSan check the C++ test suite; absence of sanitizer findings is not proof of race freedom. A separate ThreadSanitizer build also passed all native cases on the local ARM64 machine with no reported races. TSan should not be confused with ASan; both are evidence for the tested workloads, not proofs for arbitrary client usage.

Discuss tradeoffs using the actual CSV results: separable complexity reduction versus intermediate memory, contiguous stripes versus vertical cache access, local ownership versus persistent pool overhead, deterministic output versus floating-point accumulation order, and benchmark latency versus full request latency. No hardware-specific performance claim should be generalized without target measurements.
