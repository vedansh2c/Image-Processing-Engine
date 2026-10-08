import { useState } from "react";
import {
  Play,
  Download,
  FlaskConical,
  Cpu,
  Info,
  LoaderCircle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Parameters } from "../components/Parameters";
import { LatencyChart, ScalingChart } from "../components/Charts";
import { defaults, filters, modeLabel, runBenchmark } from "../services/api";
import type { Parameters as Values, Suite, Hardware } from "../services/api";
const resolutions = [
  [640, 480],
  [1280, 720],
  [1920, 1080],
  [3840, 2160],
];
export function Benchmark({ hardware }: { hardware: Hardware | null }) {
  const [params, setParams] = useState<Values>(defaults),
    [selected, setSelected] = useState([0]),
    [workers, setWorkers] = useState("1, 2, 4"),
    [iterations, setIterations] = useState(5),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [suite, setSuite] = useState<Suite | null>(null),
    [resolution, setResolution] = useState("640×480"),
    [worker, setWorker] = useState(4);
  async function run() {
    setBusy(true);
    setError("");
    try {
      const counts = workers.split(",").map((v) => Number(v.trim()));
      if (
        !counts.length ||
        counts.some((v) => !Number.isInteger(v) || v < 1 || v > 32) ||
        new Set(counts).size !== counts.length
      )
        throw new Error(
          "Enter unique worker counts from 1 to 32, separated by commas.",
        );
      if (!selected.length) throw new Error("Choose at least one resolution.");
      const result = await runBenchmark(
        params,
        selected.map((i) => resolutions[i]),
        counts,
        iterations,
      );
      setSuite(result);
      setResolution(`${result.results[0].width}×${result.results[0].height}`);
      setWorker(counts[counts.length - 1]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = suite?.results ?? [];
  const atResolution = rows.filter(
    (r) => `${r.width}×${r.height}` === resolution,
  );
  const latency = atResolution
    .filter((r) => r.mode === "sequential" || r.workers === worker)
    .map((r) => ({ name: modeLabel[r.mode], latency: r.latency_ms }));
  const counts = [
    ...new Set(
      atResolution.filter((r) => r.mode !== "sequential").map((r) => r.workers),
    ),
  ].sort((a, b) => a - b);
  const scaling = counts.map((n) => {
    const row: Record<string, number> = { workers: n };
    for (const r of atResolution)
      if (r.workers === n || r.mode === "sequential")
        row[r.mode] = r.latency_ms;
    return row;
  });
  const sizes = [...new Set(rows.map((r) => `${r.width}×${r.height}`))];
  const sizeScaling = sizes.map((size) => {
    const row: Record<string, string | number> = { resolution: size };
    for (const r of rows.filter(
      (r) =>
        `${r.width}×${r.height}` === size &&
        (r.mode === "sequential" || r.workers === worker),
    ))
      row[r.mode] = r.latency_ms;
    return row;
  });
  function download() {
    if (!suite) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(suite, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "image-processing-engine-benchmark.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="benchmark-page">
      <div className="page-title">
        <div>
          <div className="eyebrow">MEASURE, DON'T ASSUME</div>
          <h1>
            Performance lab<span>.</span>
          </h1>
          <p className="muted">
            Compare native execution across threads and resolutions.
          </p>
        </div>
        <Button variant="outline" onClick={download} disabled={!suite || busy}>
          <Download size={15} /> Export results
        </Button>
      </div>
      <div className="benchmark-layout">
        <section className="panel benchmark-config">
          <div className="panel-heading">
            <FlaskConical size={16} /> Configuration
          </div>
          <fieldset disabled={busy}>
            <label>
              Algorithm
              <select
                aria-label="Algorithm"
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
            </label>
            <Parameters value={params} onChange={setParams} />
            <label>
              Worker counts
              <input
                value={workers}
                onChange={(e) => setWorkers(e.target.value)}
                placeholder="1, 2, 4"
              />
            </label>
            <label>
              Measured iterations
              <input
                type="number"
                min="3"
                max="15"
                value={iterations}
                onChange={(e) => setIterations(+e.target.value)}
              />
            </label>
            {!["gaussian", "invert"].includes(params.filter) && (
              <p className="small muted">
                Optimized mode uses the parallel kernel for this filter.
              </p>
            )}
            <div className="label-text">Input resolutions</div>
            <div className="check-list">
              {resolutions.map((r, i) => (
                <label key={i}>
                  <input
                    type="checkbox"
                    checked={selected.includes(i)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, i].sort()
                          : selected.filter((v) => v !== i),
                      )
                    }
                  />
                  <span>
                    {r[0]} × {r[1]}
                  </span>
                  <span className="muted">{["SD", "HD", "FHD", "4K"][i]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button onClick={run} disabled={busy} className="full">
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Play size={16} />
            )}{" "}
            {busy ? "Measuring native engine…" : "Run benchmark"}
          </Button>
          <p className="small muted">
            2 warm-ups, median of {iterations} runs. Full suites can take
            several minutes.
          </p>
          <div className="hardware">
            <Cpu size={17} />
            <div>
              <strong>
                {hardware?.architecture ?? "Hardware unavailable"}
              </strong>
              <p>
                {hardware
                  ? `${hardware.hardware_threads} logical CPUs · ${hardware.platform}`
                  : "Start the backend to detect hardware."}
              </p>
              <p>{hardware?.simd}</p>
            </div>
          </div>
        </section>
        <div className="benchmark-results">
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {!suite ? (
            <div className="panel benchmark-empty">
              <FlaskConical size={38} />
              <h2>Your hardware. Real numbers.</h2>
              <p className="muted">
                Run a benchmark to reveal latency, thread scaling,
                <br /> and the cost of every megapixel.
              </p>
              <div className="empty-tags">
                <span>steady_clock</span>
                <span>Native C++</span>
                <span>No network timing</span>
              </div>
            </div>
          ) : (
            <>
              <div className="suite-toolbar">
                <span className="status">
                  <i /> {filters.find((f) => f.id === suite.filter)?.name} ·{" "}
                  {suite.iterations} measured runs
                </span>
                <label>
                  Resolution
                  <select
                    aria-label="Chart resolution"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  >
                    {sizes.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Workers
                  <select
                    aria-label="Chart workers"
                    value={worker}
                    onChange={(e) => setWorker(+e.target.value)}
                  >
                    {[
                      ...new Set(
                        rows
                          .filter((r) => r.mode !== "sequential")
                          .map((r) => r.workers),
                      ),
                    ].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="chart-grid">
                <section className="panel">
                  <h3>
                    Execution latency{" "}
                    <span className="muted small">Lower is better</span>
                  </h3>
                  <LatencyChart data={latency} />
                </section>
                <section className="panel">
                  <h3>Thread scaling</h3>
                  <ScalingChart
                    data={scaling}
                    xKey="workers"
                    xLabel="Worker count"
                  />
                  {counts.length < 2 && (
                    <p className="small muted">
                      Select multiple worker counts to measure scaling.
                    </p>
                  )}
                </section>
                <section className="panel wide">
                  <h3>Resolution scaling</h3>
                  <ScalingChart
                    data={sizeScaling}
                    xKey="resolution"
                    xLabel="Input resolution"
                  />
                  {sizes.length < 2 && (
                    <p className="small muted">
                      Select multiple resolutions to measure scaling.
                    </p>
                  )}
                </section>
              </div>
              <section className="panel table-panel">
                <h3>Measured results</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Resolution</th>
                        <th>Mode</th>
                        <th>Workers</th>
                        <th>Median</th>
                        <th>MP/s</th>
                        <th>Speedup</th>
                        <th>Timing range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td>
                            {r.width}×{r.height}
                          </td>
                          <td>{modeLabel[r.mode]}</td>
                          <td>{r.workers}</td>
                          <td>{r.latency_ms.toFixed(2)} ms</td>
                          <td>{r.throughput_mp_s.toFixed(1)}</td>
                          <td>{r.speedup?.toFixed(2)}×</td>
                          <td
                            title={`${r.min_ms.toFixed(2)}–${r.max_ms.toFixed(2)} ms`}
                          >
                            {r.comparison_reliable
                              ? "Distinct / stable"
                              : "Inconclusive"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="note">
                <Info size={16} />
                <p>
                  {suite.methodology} Gaussian outputs allow at most 1 intensity
                  level of difference; other filters must match exactly. Run on
                  an idle machine for useful comparisons.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
