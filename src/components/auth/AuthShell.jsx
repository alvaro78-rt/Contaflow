export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="cf-auth-screen">
      <svg className="cf-auth-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="cf-blue" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#041b49"/><stop offset="1" stopColor="#073b88"/></linearGradient>
          <linearGradient id="cf-green" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#087c42"/><stop offset="1" stopColor="#46c568"/></linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#cf-blue)"/>
        <path d="M0 240 Q420 230 595 0 H0Z" fill="#08428e" opacity=".55"/>
        <path d="M170 900 C340 500 1240 630 1400 0 H1600 V900Z" fill="#041e50" opacity=".72"/>
        <path d="M0 0 H270 Q175 130 0 181Z" fill="url(#cf-green)"/>
        <path d="M0 300 Q160 105 425 0" stroke="#35b95c" strokeWidth="5" fill="none"/>
        <path d="M1010 900 C1170 685 1450 700 1600 575 V900Z" fill="#08428e"/>
        <path d="M1280 900 Q1400 740 1600 640 V900Z" fill="url(#cf-green)"/>
        <path d="M1100 900 C1290 760 1470 760 1600 540" stroke="#35b95c" strokeWidth="5" fill="none"/>
      </svg>
      <main className="cf-auth-card">
        <div className="cf-auth-brand">Conta<span>Flow</span></div>
        <div className="cf-auth-heading">
          <h1>{title}</h1>
          {subtitle && <p>{title === 'Entrar' ? 'Acesse sua conta para continuar' : subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
