"use client";

import React from "react";

type Point = { date: string; count: number };

export function TimelineChart({ points, title }: { points: Point[]; title?: string }) {
  if (!points || points.length === 0) return null;

  // Layout
  const width = 600;
  const height = 260;
  const margin = { top: 24, right: 16, bottom: 36, left: 40 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Scales
  const xStep = innerW / Math.max(points.length - 1, 1);
  const yMax = Math.max(...points.map((p) => p.count), 1);
  const yScale = (v: number) => innerH - (v / yMax) * innerH;

  // Ticks
  const xTicks: { x: number; label: string }[] = [];
  const tickEvery = Math.ceil(points.length / 6);
  points.forEach((p, i) => {
    if (i % tickEvery === 0 || i === points.length - 1) {
      xTicks.push({ x: i * xStep, label: p.date });
    }
  });

  // Line path
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${i * xStep},${yScale(p.count)}`)
    .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      {title && <div className="text-sm font-medium mb-2 text-foreground">{title}</div>}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        className="rounded-md border border-border/50 bg-muted/30"
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Y axis */}
          <line x1={0} y1={0} x2={0} y2={innerH} stroke="currentColor" opacity={0.2} />
          {[0, yMax].map((t, i) => (
            <g key={i}>
              <line x1={0} y1={yScale(t)} x2={innerW} y2={yScale(t)} stroke="currentColor" opacity={0.08} />
              <text x={-8} y={yScale(t)} dy="0.32em" textAnchor="end" className="text-[10px] fill-muted-foreground">
                {t}
              </text>
            </g>
          ))}

          {/* X axis */}
          <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="currentColor" opacity={0.2} />
          {xTicks.map((t, i) => (
            <g key={i} transform={`translate(${t.x},0)`}>
              <line x1={0} y1={innerH} x2={0} y2={innerH + 4} stroke="currentColor" />
              <text x={0} y={innerH + 16} textAnchor="middle" className="text-[10px] fill-muted-foreground">
                {t.label}
              </text>
            </g>
          ))}

          {/* Line */}
          <path d={pathD} fill="none" stroke="#ef4444" strokeWidth={2} />
          {/* Points */}
          {points.map((p, i) => (
            <circle key={i} cx={i * xStep} cy={yScale(p.count)} r={3} fill="#ef4444" />
          ))}
        </g>
      </svg>
    </div>
  );
}

