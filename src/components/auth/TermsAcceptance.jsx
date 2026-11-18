import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function TermsAcceptance({ checked, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1 border border-border bg-muted/40 px-3 py-2">
      <div className="flex items-start gap-2 text-sm">
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
        <span>
          Li e aceito o{' '}
          <button type="button" className="text-primary font-medium underline" onClick={() => setOpen(true)}>
            termo de uso e tratamento de dados
          </button>{' '}
          do sistema.
        </span>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Termo de uso e tratamento de dados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">1. Objeto.</strong> Este termo regula o uso do sistema de gestão de
              ponto, folha de pagamento e contracheques da empresa selecionada no cadastro.
            </p>
            <p>
              <strong className="text-foreground">2. Acesso pessoal.</strong> O acesso é pessoal e intransferível,
              vinculado ao CPF informado. O usuário é responsável por manter sua senha em sigilo e por comunicar ao
              responsável da empresa qualquer uso indevido.
            </p>
            <p>
              <strong className="text-foreground">3. Veracidade das informações.</strong> O usuário declara que os
              dados informados (nome, CPF e data de nascimento) são verdadeiros, sendo usados na conferência de
              identidade e na recuperação de senha.
            </p>
            <p>
              <strong className="text-foreground">4. Registro de jornada.</strong> As marcações de ponto registradas
              no sistema são utilizadas para o cálculo de horas trabalhadas, atrasos, faltas e horas extras, com
              tolerância de 5 minutos por marcação. Correções exigem justificativa e ficam registradas com histórico.
            </p>
            <p>
              <strong className="text-foreground">5. Dados pessoais.</strong> Os dados são tratados exclusivamente
              para fins de gestão de pessoal, cumprimento de obrigações trabalhistas, previdenciárias e fiscais
              (LGPD, art. 7º, II e III), com acesso restrito ao próprio usuário e aos administradores da empresa.
            </p>
            <p>
              <strong className="text-foreground">6. Contracheques.</strong> Os demonstrativos de pagamento ficam
              disponíveis para consulta individual. O aceite registra a ciência das informações apresentadas.
            </p>
            <p>
              <strong className="text-foreground">7. Aceite.</strong> Ao marcar a caixa e concluir o cadastro, o
              usuário declara ter lido e concordado com este termo, registrando-se a data e a hora do aceite.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}