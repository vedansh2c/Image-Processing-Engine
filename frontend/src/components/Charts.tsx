import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from "recharts";
export const colors = {
  sequential: "#939cae",
  multithreaded: "#b8a2ff",
  optimized: "#c6f178",
};
const tooltip = {
  contentStyle: {
    background: "#202228",
    border: "1px solid #383b43",
    borderRadius: 8,
    color: "#fff",
  },
  labelStyle: { color: "#fff" },
};
export function LatencyChart({
  data,
}: {
  data: { name: string; latency: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 12, top: 16, bottom: 0 }}>
        <CartesianGrid stroke="#2a2c33" vertical={false} />
        <XAxis dataKey="name" stroke="#9095a2" fontSize={11} tickLine={false} />
        <YAxis
          stroke="#9095a2"
          fontSize={11}
          width={45}
          tickLine={false}
          unit="ms"
        />
        <Tooltip {...tooltip} cursor={{ fill: "#ffffff08" }} />
        <Bar
          isAnimationActive={false}
          dataKey="latency"
          name="Latency (ms)"
          fill={colors.optimized}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
export function ScalingChart({
  data,
  xKey,
  xLabel,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  xLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart
        data={data}
        margin={{ left: 0, right: 16, top: 16, bottom: 8 }}
      >
        <CartesianGrid stroke="#2a2c33" vertical={false} />
        <XAxis
          dataKey={xKey}
          stroke="#9095a2"
          fontSize={11}
          label={{
            value: xLabel,
            position: "insideBottom",
            offset: -5,
            fill: "#9095a2",
            fontSize: 11,
          }}
        />
        <YAxis stroke="#9095a2" fontSize={11} width={45} unit="ms" />
        <Tooltip {...tooltip} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
        {Object.entries(colors).map(([key, color]) => (
          <Line
            isAnimationActive={false}
            key={key}
            type="linear"
            dataKey={key}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
