import { formatDisplayDate } from "@/lib/dates";

export function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">No weights yet.</p>;
  if (points.length === 1) {
    return (
      <p className="text-sm">
        Latest weight <span className="font-semibold tabular-nums">{points[0].kg} kg</span> on {formatDisplayDate(points[0].date)}.
      </p>
    );
  }
  const min = Math.min(...points.map((point) => point.kg));
  const max = Math.max(...points.map((point) => point.kg));
  const span = max - min;
  const width = 360;
  const height = 148;
  const plotPoints = points.map((point, index) => {
    const x = (index / (points.length - 1)) * (width - 32) + 16;
    const y = span === 0 ? height / 2 : height - 26 - ((point.kg - min) / span) * (height - 46);
    return { x, y, ...point };
  });
  const coords = plotPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const first = plotPoints[0];
  const last = plotPoints[plotPoints.length - 1];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>Range: {min} – {max} kg</span>
        <span>Latest: {last.kg} kg</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-primary" role="img" aria-label={`Weight chart from ${min} to ${max} kg`}>
        <polyline fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={coords} />
        {plotPoints.map((point) => (
          <circle key={`${point.date}-${point.kg}`} cx={point.x} cy={point.y} r="3.5" fill="currentColor" />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{formatDisplayDate(first.date)}</span>
        <span>{formatDisplayDate(last.date)}</span>
      </div>
    </div>
  );
}
