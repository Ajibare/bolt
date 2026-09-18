"use client";

import { ColorType, createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

const GRID_COLOR = "rgba(113,113,122,0.12)";
const BORDER_COLOR = "rgba(113,113,122,0.25)";

export interface EquityPoint {
  timestamp: number;
  equity: string;
}

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const chart = createChart(container, {
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      timeScale: { borderColor: BORDER_COLOR, rightOffset: 4 },
      rightPriceScale: { borderColor: BORDER_COLOR },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#10b981",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    series.setData(
      points.map((p) => ({
        time: Math.floor(p.timestamp / 1000) as UTCTimestamp,
        value: Number(p.equity),
      })),
    );
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [points]);

  if (points.length === 0) {
    return <p className="text-sm text-zinc-500">No equity data available.</p>;
  }

  return <div ref={containerRef} className="w-full" />;
}
