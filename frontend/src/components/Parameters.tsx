import type { Parameters as Values } from "../services/api";
export function Parameters({
  value,
  onChange,
  disabled = false,
}: {
  value: Values;
  onChange: (v: Values) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof Values, v: number | string) =>
    onChange({ ...value, [key]: v });
  return (
    <fieldset disabled={disabled} className="parameters">
      {value.filter === "gaussian" && (
        <>
          <label>
            Kernel size{" "}
            <span className="mono">
              {value.kernel} × {value.kernel}
            </span>
            <input
              aria-label="Kernel size"
              type="range"
              min="1"
              max="31"
              step="2"
              value={value.kernel}
              onChange={(e) => set("kernel", +e.target.value)}
            />
          </label>
          <label>
            Sigma <span className="mono">{value.sigma.toFixed(1)}</span>
            <input
              aria-label="Sigma"
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              value={value.sigma}
              onChange={(e) => set("sigma", +e.target.value)}
            />
          </label>
        </>
      )}
      {value.filter === "adjust" && (
        <>
          <label>
            Brightness <span>{value.brightness}</span>
            <input
              aria-label="Brightness"
              type="range"
              min="-255"
              max="255"
              value={value.brightness}
              onChange={(e) => set("brightness", +e.target.value)}
            />
          </label>
          <label>
            Contrast <span>{value.contrast.toFixed(1)}</span>
            <input
              aria-label="Contrast"
              type="range"
              min="0"
              max="4"
              step="0.1"
              value={value.contrast}
              onChange={(e) => set("contrast", +e.target.value)}
            />
          </label>
        </>
      )}
      {value.filter === "resize" && (
        <>
          <div className="two-inputs">
            <label>
              Width
              <input
                aria-label="Output width"
                type="number"
                min="1"
                max="8192"
                value={value.width}
                onChange={(e) => set("width", +e.target.value)}
              />
            </label>
            <label>
              Height
              <input
                aria-label="Output height"
                type="number"
                min="1"
                max="8192"
                value={value.height}
                onChange={(e) => set("height", +e.target.value)}
              />
            </label>
          </div>
          <label>
            Interpolation
            <select
              value={value.interpolation}
              onChange={(e) => set("interpolation", e.target.value)}
            >
              <option value="bilinear">Bilinear</option>
              <option value="nearest">Nearest neighbor</option>
            </select>
          </label>
        </>
      )}
      {!["gaussian", "adjust", "resize"].includes(value.filter) && (
        <p className="muted small">
          This filter has no configurable parameters.
        </p>
      )}
    </fieldset>
  );
}
