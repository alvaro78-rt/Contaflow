export default function Empty({ children }) {
  return (
    <div className="border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}