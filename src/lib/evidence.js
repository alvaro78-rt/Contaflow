import { base44 } from '@/api/base44Client';

// Evidências da conferência são arquivos privados: o acesso é liberado por link assinado.
export async function uploadEvidence(file) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  if (!file_uri) throw new Error('upload_invalido');
  return file_uri;
}

export async function openEvidence(file_uri) {
  try {
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri });
    if (signed_url) window.open(signed_url, '_blank', 'noopener');
  } catch {
    // Arquivo removido ou link expirado: nada é exibido em vez de um erro técnico.
  }
}
