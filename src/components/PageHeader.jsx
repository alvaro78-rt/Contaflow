export default function PageHeader({ code, title, description }) {
  return (
    <div className="mb-8 border-b border-border pb-6 print:hidden">
      {code && <p className="mb-2 font-mono text-xs text-emerald-700">[{code}]</p>}
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
    </div>
  );
}