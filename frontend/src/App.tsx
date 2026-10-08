import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowUpRight,
  BarChart3,
  Cpu,
  Download,
  ImagePlus,
  Layers,
  LoaderCircle,
  Maximize,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Upload,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  ChevronRight,
  Activity,
  Check,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Parameters } from "./components/Parameters";
import { LatencyChart } from "./components/Charts";
import { Benchmark } from "./pages/Benchmark";
import {
  defaults,
  filters,
  getSystem,
  modeLabel,
  processImage,
} from "./services/api";
import type {
  Parameters as Values,
  ProcessResult,
  Hardware,
} from "./services/api";
interface Entry {
  result: ProcessResult;
  filter: string;
  signature: string;
  time: string;
}
export default function App() {
  const [page, setPage] = useState<"workspace" | "benchmark">("workspace"),
    [params, setParams] = useState<Values>(defaults),
    [file, setFile] = useState<File | null>(null),
    [original, setOriginal] = useState(""),
    [output, setOutput] = useState(""),
    [dimensions, setDimensions] = useState({ width: 0, height: 0 }),
    [result, setResult] = useState<ProcessResult | null>(null),
    [history, setHistory] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hardware, setHardware] = useState<Hardware | null>(null),
    [online, setOnline] = useState(false),
    [split, setSplit] = useState(50),
    [zoom, setZoom] = useState(1),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploadGeneration = useRef(0);
  useEffect(() => {
    getSystem()
      .then((s) => {
        setHardware(s);
        setOnline(true);
      })
      .catch(() => setOnline(false));
  }, []);
  useEffect(
    () => () => {
      if (original) URL.revokeObjectURL(original);
    },
    [original],
  );
  async function upload(next: File) {
    setError("");
    if (next.size > 20 * 1024 * 1024) {
      setError("Image exceeds the 20 MiB upload limit.");
      return;
    }
    if (!/\.(png|jpe?g)$/i.test(next.name)) {
      setError("Choose a PNG or JPEG image.");
      return;
    }
    const generation = ++uploadGeneration.current;
    const url = URL.createObjectURL(next);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (generation !== uploadGeneration.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (
        image.naturalWidth > 8192 ||
        image.naturalHeight > 8192 ||
        image.naturalWidth * image.naturalHeight > 16 * 1024 * 1024
      )
        throw new Error(
          "Image is limited to 8192 pixels per side and 16 megapixels.",
        );
      setFile(next);
      setOriginal(url);
      setOutput("");
      setResult(null);
      setHistory([]);
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setParams((v) => ({
        ...v,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
      setZoom(1);
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(
        e instanceof Error && e.message.includes("limited")
          ? e.message
          : "This image could not be decoded. Try a different PNG or JPEG.",
      );
    }
  }
  function signature(v: Values) {
    const { mode: _, workers: __, ...rest } = v;
    return JSON.stringify(rest);
  }
  async function process() {
    if (!file) return;
    const generation = uploadGeneration.current;
    setBusy(true);
    setError("");
    try {
      const measured = await processImage(file, params);
      if (generation !== uploadGeneration.current) return;
      const key = signature(params);
      const baseline =
        params.mode === "sequential"
          ? measured
          : history.find(
              (e) => e.signature === key && e.result.mode === "sequential",
            )?.result;
      measured.speedup = baseline
        ? baseline.latency_ms / measured.latency_ms
        : null;
      setResult(measured);
      setOutput(`data:image/png;base64,${measured.image_base64}`);
      setSplit(50);
      setHistory((v) =>
        [
          {
            result: measured,
            filter: params.filter,
            signature: key,
            time: new Date().toLocaleTimeString(),
          },
          ...v,
        ].slice(0, 20),
      );
      setOnline(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    ++uploadGeneration.current;
    setParams(defaults);
    setFile(null);
    setOriginal("");
    setOutput("");
    setResult(null);
    setHistory([]);
    setError("");
    setZoom(1);
    if (input.current) input.current.value = "";
  }
  const currentKey = signature(params);
  const comparison = ["sequential", "multithreaded", "optimized"].flatMap(
    (mode) => {
      const entry = history.find(
        (e) => e.signature === currentKey && e.result.mode === mode,
      );
      return entry
        ? [
            {
              name: modeLabel[entry.result.mode],
              latency: entry.result.latency_ms,
            },
          ]
        : [];
    },
  );
  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("workspace");
          }}
        >
          <span className="brand-icon">
            <Aperture size={23} />
          </span>
          Image Processing Engine<span className="version">v1.0</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={page === "workspace" ? "active" : ""}
            onClick={() => setPage("workspace")}
          >
            <Layers size={15} />
            Workspace
          </button>
          <button
            className={page === "benchmark" ? "active" : ""}
            onClick={() => setPage("benchmark")}
            disabled={busy}
          >
            <BarChart3 size={15} />
            Benchmarks
          </button>
        </nav>
        <div className="header-status">
          <span className={`status ${online ? "" : "offline"}`}>
            <i />
            {online ? "Native engine online" : "Backend unavailable"}
          </span>
          <span className="cpp">C++17</span>
        </div>
      </header>
      {page === "benchmark" ? (
        <Benchmark hardware={hardware} />
      ) : (
        <main className="workspace-page">
          <div className="page-title">
            <div>
              <div className="eyebrow">NATIVE SPEED. PIXEL PRECISION.</div>
              <h1>
                Image workbench<span>.</span>
              </h1>
              <p className="muted">
                Explore the algorithms. See the difference. Measure the
                performance.
              </p>
            </div>
            <span className="hardware-pill">
              <Cpu size={14} />
              {hardware
                ? `${hardware.architecture} · ${hardware.hardware_threads} logical CPUs`
                : "CPU processing"}
            </span>
          </div>
          <div className="workspace-grid">
            <aside className="panel controls">
              <div className="panel-heading">
                <SlidersHorizontal size={16} /> Processing controls
                <span className="step">01</span>
              </div>
              <div className="controls-body">
                <div className="section-label">SOURCE IMAGE</div>
                <button
                  disabled={busy}
                  className={`upload-area ${drag ? "drag" : ""}`}
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    if (!busy && e.dataTransfer.files[0])
                      void upload(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload size={22} />
                  <strong>
                    {file ? "Replace image" : "Drop your image here"}
                  </strong>
                  <span>or click to browse</span>
                  <small>PNG, JPEG · up to 20 MiB</small>
                </button>
                <input
                  ref={input}
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.[0]) void upload(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
                {file && (
                  <div className="file-meta">
                    <span className="file-name" title={file.name}>
                      <Check size={13} />
                      {file.name}
                    </span>
                    <span>
                      {dimensions.width} × {dimensions.height} ·{" "}
                      {(file.size / 1024).toFixed(0)} KB ·{" "}
                      {file.name.split(".").pop()?.toUpperCase()}
                    </span>
                  </div>
                )}
                <fieldset disabled={busy}>
                  <div className="section-label">ALGORITHM</div>
                  <label className="sr-only" htmlFor="filter">
                    Filter
                  </label>
                  <select
                    id="filter"
                    value={params.filter}
                    onChange={(e) =>
                      setParams({
                        ...params,
                        filter: e.target.value as Values["filter"],
                      })
                    }
                  >
                    {filters.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <p className="filter-description">
                    {filters.find((f) => f.id === params.filter)?.description}
                  </p>
                  <Parameters value={params} onChange={setParams} />
                  <div className="section-label execution-label">EXECUTION</div>
                  <div className="mode-options">
                    {(
                      ["sequential", "multithreaded", "optimized"] as const
                    ).map((mode, i) => (
                      <label
                        key={mode}
                        className={params.mode === mode ? "selected" : ""}
                      >
                        <input
                          aria-label={mode}
                          type="radio"
                          name="mode"
                          value={mode}
                          checked={params.mode === mode}
                          onChange={() => setParams({ ...params, mode })}
                        />
                        <div>
                          <strong>{modeLabel[mode]}</strong>
                          <span>
                            {
                              [
                                "Single-thread baseline",
                                "Parallel row processing",
                                "Separable blur · SIMD invert",
                              ][i]
                            }
                          </span>
                        </div>
                        {mode === "optimized" && (
                          <span className="fast-tag">FAST PATH</span>
                        )}
                      </label>
                    ))}
                  </div>
                  <label className="workers-label">
                    Worker threads
                    <span className="mono">
                      {params.mode === "sequential" ? 1 : params.workers}
                    </span>
                    <input
                      aria-label="Worker threads"
                      disabled={params.mode === "sequential"}
                      type="range"
                      min="1"
                      max="32"
                      value={params.workers}
                      onChange={(e) =>
                        setParams({ ...params, workers: +e.target.value })
                      }
                    />
                  </label>
                  <p className="small muted">
                    {params.mode === "optimized" &&
                    !["gaussian", "invert"].includes(params.filter)
                      ? "This filter uses the same parallel kernel in optimized mode."
                      : "Workers are reused throughout this request."}
                  </p>
                </fieldset>
                <div className="process-actions">
                  <Button
                    onClick={process}
                    disabled={!file || busy}
                    className="full"
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {busy ? "Processing…" : "Process image"}
                    <ChevronRight size={15} />
                  </Button>
                  <Button
                    onClick={reset}
                    disabled={busy}
                    variant="ghost"
                    className="full"
                  >
                    <RotateCcw size={14} />
                    Reset workspace
                  </Button>
                </div>
              </div>
            </aside>
            <section className="panel preview-panel">
              <div className="panel-heading">
                <ImagePlus size={16} /> Image preview
                <span className="preview-dimensions">
                  {file
                    ? `${dimensions.width} × ${dimensions.height}`
                    : "No image loaded"}
                </span>
              </div>
              <div className="preview-toolbar">
                <div className="preview-legend">
                  <span>
                    <i />
                    Original
                  </span>
                  <span>
                    <i />
                    Processed
                  </span>
                </div>
                <div className="zoom-controls">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Zoom out"
                    disabled={!file || zoom <= 0.5}
                    onClick={() => setZoom((v) => Math.max(0.5, v - 0.25))}
                  >
                    <ZoomOut size={15} />
                  </Button>
                  <span className="mono">{Math.round(zoom * 100)}%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Zoom in"
                    disabled={!file || zoom >= 3}
                    onClick={() => setZoom((v) => Math.min(3, v + 0.25))}
                  >
                    <ZoomIn size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Fit image"
                    disabled={!file}
                    onClick={() => setZoom(1)}
                  >
                    <Maximize size={15} />
                  </Button>
                </div>
              </div>
              <div className={`image-stage ${file ? "has-image" : ""}`}>
                {file ? (
                  <>
                    <div className="comparison-images">
                      <img
                        src={original}
                        alt="Original upload"
                        style={{ transform: `scale(${zoom})` }}
                      />
                      {output && (
                        <div
                          className="processed-layer"
                          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                        >
                          <img
                            src={output}
                            alt="Processed image"
                            style={{ transform: `scale(${zoom})` }}
                          />
                        </div>
                      )}
                      {output && (
                        <div
                          className="split-line"
                          style={{ left: `${split}%` }}
                        >
                          <span>‹ ›</span>
                        </div>
                      )}
                    </div>
                    {output && (
                      <input
                        className="comparison-range"
                        type="range"
                        aria-label="Before and after comparison"
                        min="0"
                        max="100"
                        value={split}
                        onChange={(e) => setSplit(+e.target.value)}
                      />
                    )}
                    <div className="image-badges">
                      <span>ORIGINAL</span>
                      {output && <span>PROCESSED</span>}
                    </div>
                  </>
                ) : (
                  <div className="preview-empty">
                    <div className="empty-grid">
                      <ImagePlus size={32} />
                    </div>
                    <h2>A canvas for your curiosity.</h2>
                    <p>
                      Upload an image to start exploring
                      <br />
                      native image processing.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => input.current?.click()}
                    >
                      <Upload size={14} />
                      Choose an image
                    </Button>
                    <span className="native-caption">
                      ALL PIXEL OPERATIONS RUN IN C++
                    </span>
                  </div>
                )}
                {busy && (
                  <div className="processing-overlay">
                    <LoaderCircle size={28} className="spin" />
                    <span>Running native {params.filter}…</span>
                  </div>
                )}
              </div>
              <div className="preview-footer">
                <span className="small muted">
                  {output
                    ? "Drag the divider to compare. Both images fit the canvas."
                    : "Your images stay in this application."}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!output}
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = output;
                    a.download = `image-processing-engine-${result?.mode ?? "output"}.png`;
                    a.click();
                  }}
                >
                  <Download size={14} />
                  Download PNG
                </Button>
              </div>
              {error && (
                <div className="error" role="alert">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              <div className="engine-note">
                <Cpu size={18} />
                <div>
                  <strong>Built for the CPU.</strong>
                  <p>
                    RAII memory ownership, reusable workers, and
                    architecture-aware execution.
                  </p>
                </div>
                <span>C++17</span>
              </div>
            </section>
            <aside className="performance-column">
              <section className="panel">
                <div className="panel-heading">
                  <Activity size={16} /> Performance
                  <span className="step">02</span>
                </div>
                <div className="metrics">
                  <div className="main-metric">
                    <span>PROCESSING LATENCY</span>
                    <strong>
                      {result ? result.latency_ms.toFixed(2) : "—"}
                      <small>ms</small>
                    </strong>
                    <p>Native processing only</p>
                  </div>
                  <div className="metric-pair">
                    <div>
                      <span>Throughput</span>
                      <strong>
                        {result ? result.throughput_mp_s.toFixed(1) : "—"}
                        <small> MP/s</small>
                      </strong>
                    </div>
                    <div>
                      <span>Speedup</span>
                      <strong>
                        {result?.speedup
                          ? result.speedup.toFixed(2) + "×"
                          : "—"}
                      </strong>
                    </div>
                  </div>
                  <div className="metric-details">
                    <span>
                      Execution
                      <strong>{result ? modeLabel[result.mode] : "—"}</strong>
                    </span>
                    <span>
                      Workers<strong>{result?.workers ?? "—"}</strong>
                    </span>
                    <span>
                      Output
                      <strong>
                        {result ? `${result.width} × ${result.height}` : "—"}
                      </strong>
                    </span>
                  </div>
                  <p className="small muted">
                    {result?.speedup
                      ? "Single-run comparison; use the lab for repeated measurements."
                      : "Run sequential with the same image and parameters to compare speedup."}
                  </p>
                </div>
              </section>
              <section className="panel mini-chart">
                <h3>
                  Mode comparison<span className="muted small">ms</span>
                </h3>
                {comparison.length ? (
                  <LatencyChart data={comparison} />
                ) : (
                  <div className="chart-empty">
                    <BarChart3 size={24} />
                    <p>
                      Measurements appear here
                      <br />
                      after processing.
                    </p>
                  </div>
                )}
                <p className="small muted">
                  Latest run per mode with matching parameters.
                </p>
              </section>
              <section className="panel history">
                <h3>
                  Session history
                  <span className="history-count">{history.length}</span>
                </h3>
                {history.length ? (
                  <div className="history-list">
                    {history.map((e, i) => (
                      <div key={i}>
                        <span className={`history-dot ${e.result.mode}`} />
                        <div>
                          <strong>
                            {filters.find((f) => f.id === e.filter)?.name}
                          </strong>
                          <span>
                            {modeLabel[e.result.mode]} · {e.result.workers}{" "}
                            workers
                          </span>
                        </div>
                        <span className="mono">
                          {e.result.latency_ms.toFixed(2)}
                          <small> ms</small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="small muted">
                    Your last 20 runs, right here.
                    <br />
                    Upload an image to begin.
                  </p>
                )}
              </section>
              <button
                className="lab-link"
                onClick={() => setPage("benchmark")}
                disabled={busy}
              >
                <FlaskIcon />
                <div>
                  <strong>Go deeper in the lab</strong>
                  <span>Thread & resolution scaling</span>
                </div>
                <ArrowUpRight size={17} />
              </button>
            </aside>
          </div>
          <footer>
            <span>
              <Aperture size={13} />
              Image Processing Engine — engineered, not simulated.
            </span>
            <span>Portable C++ · ARM64 / x86-64</span>
          </footer>
        </main>
      )}
    </div>
  );
}
function FlaskIcon() {
  return <BarChart3 size={19} />;
}
