export function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">No weights yet.</p>;
  if (points.length === 1) return <p className="text-sm">Latest weight {points[0].kg} kg on {points[0].date}.</p>;
  const min = Math.min(...points.map((point) => point.kg));
  const max = Math.max(...points.map((point) => point.kg));
  const width = 360;
  const height = 140;
  const coords = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * (width - 24) + 12;
      const y = height - 20 - ((point.kg - min) / (max - min || 1)) * (height - 36);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-primary" role="img" aria-label="Weight chart">
      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={coords} />
    </svg>
  );
}
