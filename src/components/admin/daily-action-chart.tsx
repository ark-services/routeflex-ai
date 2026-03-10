"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type DailyActionData = {
  date: string;
  actions: number;
};

export function DailyActionChart({ data }: { data: DailyActionData[] }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatTooltipDate = (label: any) => {
    if (typeof label !== "string") return "";
    const date = new Date(label);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e7e5e4"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "#78716c", fontSize: 12 }}
            axisLine={{ stroke: "#e7e5e4" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            tick={{ fill: "#78716c", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: "Actions",
              angle: -90,
              position: "insideLeft",
              style: { fill: "#78716c", fontSize: 12 }
            }}
          />
          <Tooltip
            cursor={{ fill: "rgba(168, 85, 247, 0.1)" }}
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e7e5e4",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "12px",
            }}
            labelFormatter={formatTooltipDate}
            formatter={(value) => [value ?? 0, "Actions"]}
          />
          <Bar
            dataKey="actions"
            fill="#a855f7"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
