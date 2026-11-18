export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-6 w-6 place-items-center bg-green-400 font-mono text-[11px] text-primary">F</span>
          Folha<span className="text-green-300">/</span>Ledger
        </div>
        <div>
          <p className="mb-3 font-mono text-xs text-green-300">[ACESSO AO SISTEMA]</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Cada número<br />conferido, cada<br />acesso controlado.</h1>
          <p className="mt-4 max-w-sm text-sm text-primary-foreground/70">Entre com seu CPF e senha. Administradores cuidam dos cadastros e da folha; funcionários consultam o próprio ponto e contracheque.</p>
        </div>
        <p className="font-mono text-[11px] text-primary-foreground/40">Sistema de folha de pagamento · v1.0</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5">
          <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight md:hidden">
            <span className="grid h-9 w-9 place-items-center bg-primary font-mono text-base font-bold text-primary-foreground">F</span>
            Folha<span className="text-emerald-600">/</span>Ledger
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}