export type Mode = "sequential" | "multithreaded" | "optimized";
export type Filter =
  | "grayscale"
  | "adjust"
  | "gaussian"
  | "sobel"
  | "sharpen"
  | "resize"
  | "invert";
export interface Parameters {
  filter: Filter;
  mode: Mode;
  workers: number;
  kernel: number;
  sigma: number;
  brightness: number;
  contrast: number;
  width: number;
  height: number;
  interpolation: "bilinear" | "nearest";
}
export interface Metrics {
  latency_ms: number;
  throughput_mp_s: number;
  workers: number;
  mode: Mode;
  width: number;
  height: number;
  speedup: number | null;
}
export interface ProcessResult extends Metrics {
  image_base64: string;
  request_ms: number;
  channels: number;
}
export interface BenchmarkRow extends Metrics {
  min_ms: number;
  max_ms: number;
  stable: boolean;
  comparison_reliable: boolean;
  max_pixel_difference: number;
}
export interface Hardware {
  hardware_threads: number;
  simd: string;
  architecture: string;
  platform: string;
  python: string;
}
export interface Suite {
  results: BenchmarkRow[];
  system: Hardware;
  iterations: number;
  warmup: number;
  filter: Filter;
  parameters: Parameters;
  request_ms: number;
  methodology: string;
}
export const defaults: Parameters = {
  filter: "gaussian",
  mode: "optimized",
  workers: 4,
  kernel: 5,
  sigma: 1.4,
  brightness: 0,
  contrast: 1,
  width: 640,
  height: 480,
  interpolation: "bilinear",
};
export const filters: { id: Filter; name: string; description: string }[] = [
  { id: "grayscale", name: "Grayscale", description: "Luminance-weighted RGB" },
  {
    id: "adjust",
    name: "Brightness / contrast",
    description: "Linear color adjustment",
  },
  {
    id: "gaussian",
    name: "Gaussian blur",
    description: "Smooth detail with a Gaussian kernel",
  },
  {
    id: "sobel",
    name: "Sobel edges",
    description: "Horizontal and vertical gradients",
  },
  { id: "sharpen", name: "Sharpen", description: "Enhance local contrast" },
  { id: "resize", name: "Resize", description: "Nearest or bilinear sampling" },
  { id: "invert", name: "Invert", description: "Complement RGB values" },
];
export const modeLabel: Record<Mode, string> = {
  sequential: "Sequential",
  multithreaded: "Multithreaded",
  optimized: "Optimized",
};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api" + path, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail);
    } catch {
      /* Keep HTTP error for non-JSON proxy responses. */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export const getSystem = () => request<Hardware>("/system");
export async function processImage(image: File, parameters: Parameters) {
  const body = new FormData();
  body.append("image", image);
  body.append("parameters", JSON.stringify(parameters));
  return request<ProcessResult>("/process", { method: "POST", body });
}
export const runBenchmark = (
  parameters: Parameters,
  resolutions: number[][],
  workers: number[],
  iterations: number,
) =>
  request<Suite>("/benchmark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parameters, resolutions, workers, iterations }),
  });
