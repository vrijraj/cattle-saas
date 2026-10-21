export function MilkChart({ points }: { points: { date: string; litres: number }[] }) {
  if (points.length === 0) return null;
  if (points.length === 1) return <p className="text-sm">{points[0].litres.toFixed(1)} L on {points[0].date}.</p>;
  const min = Math.min(...points.map((point) => point.litres));
  const max = Math.max(...points.map((point) => point.litres));
  const width = 360;
  const height = 140;
  const coords = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * (width - 24) + 12;
      const y = height - 20 - ((point.litres - min) / (max - min || 1)) * (height - 36);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-primary" role="img" aria-label="Milk chart">
      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={coords} />
    </svg>
  );
}
