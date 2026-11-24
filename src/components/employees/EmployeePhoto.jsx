import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';

const isPublicUrl = (v) => /^https?:\/\//i.test(v || '');

/**
 * Foto do funcionário com suporte aos dois formatos de armazenamento:
 * - arquivos antigos, guardados como URL pública;
 * - arquivos novos, guardados como referência privada (URL assinada sob demanda).
 */
export default function EmployeePhoto({ value, name, className = 'h-16 w-16' }) {
  const [src, setSrc] = useState(() => (isPublicUrl(value) ? value : ''));

  useEffect(() => {
    let active = true;
    if (!value) {
      setSrc('');
      return undefined;
    }
    if (isPublicUrl(value)) {
      setSrc(value);
      return undefined;
    }
    base44.integrations.Core.CreateFileSignedUrl({ file_uri: value })
      .then((res) => { if (active) setSrc(res?.signed_url || ''); })
      .catch(() => { if (active) setSrc(''); });
    return () => { active = false; };
  }, [value]);

  if (!src) {
    return <span className="font-mono text-sm text-muted-foreground">{(name || '?').slice(0, 2).toUpperCase()}</span>;
  }
  return <Image src={src} alt={name} className={className} fittingType="fill" />;
}
