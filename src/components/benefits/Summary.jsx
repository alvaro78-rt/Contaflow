export default function Summary({ items }) {
  return (
    <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="bg-card px-5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="font-mono text-lg font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}