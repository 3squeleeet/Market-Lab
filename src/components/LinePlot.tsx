export function LinePlot({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  if (values.length < 2)
    return (
      <p className="empty-row">
        Aguardando amostras para {label.toLowerCase()}.
      </p>
    );
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const stride = Math.max(1, Math.ceil(values.length / 350));
  const sampled = values.filter(
    (_, i) => i % stride === 0 || i === values.length - 1,
  );
  const points = sampled
    .map(
      (n, i) =>
        `${(i / (sampled.length - 1)) * 900},${170 - ((n - min) / range) * 145}`,
    )
    .join(" ");
  return (
    <div className="line-plot">
      <div>
        <span>{label}</span>
        <span>
          {max.toFixed(2)} / {min.toFixed(2)} USD
        </span>
      </div>
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 900 190"
        preserveAspectRatio="none"
      >
        <path
          d="M0 170H900M0 95H900M0 25H900"
          stroke="#26313a"
          strokeWidth="1"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#53d6a4"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
