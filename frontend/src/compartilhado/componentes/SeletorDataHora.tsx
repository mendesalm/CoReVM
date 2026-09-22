// Campos de Data e Hora reutilizáveis, com o mesmo picker (react-datepicker) em toda a aplicação,
// estilizados para combinar com o tema escuro do CoReVM (fundo #080808, borda #333, destaque #facc15).
// Substituem os antigos <input type="date"> / <input type="time"> nativos, cujo visual varia entre
// navegadores/SO — aqui o calendário/relógio é sempre o mesmo, com locale pt-BR.
import { forwardRef } from 'react';
// Import direto do build ESM (dist/es/index.js), contornando o resolve padrão do pacote:
// o build CJS (campo "main") expõe { default, registerLocale, ... } como propriedades de um
// objeto só, e o bundler deste projeto (Vite com rolldown) não desembrulha esse ".default" no
// import default — o React recebia o objeto inteiro em vez do componente. Importando o ESM
// (que já usa "export { DatePicker as default }") evita esse problema de vez.
import DatePicker, { registerLocale } from 'react-datepicker/dist/es/index.js';
import { ptBR } from 'date-fns/locale/pt-BR';
import { Calendar, Clock } from 'lucide-react';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('pt-BR', ptBR);

const CLASSE_PADRAO =
  'w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-xs text-white focus:border-[#facc15] focus:outline-none';

/** 'YYYY-MM-DD' (o formato que o backend espera) <-> Date local, sem deslocamento de fuso. */
function isoParaData(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-').map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}
function dataParaIso(data: Date | null): string {
  if (!data) return '';
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** 'HH:mm' <-> Date (só a parte de hora importa). */
function horaParaData(hhmm: string | null | undefined): Date | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}
function dataParaHora(data: Date | null): string {
  if (!data) return '';
  const h = String(data.getHours()).padStart(2, '0');
  const m = String(data.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// Botão de input custom, com o ícone à direita, no mesmo estilo dos demais campos do formulário.
const CampoComIcone = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { icone: 'data' | 'hora'; className?: string }
>(({ icone, className, ...props }, ref) => {
  const Icone = icone === 'data' ? Calendar : Clock;
  return (
    <div className="relative">
      <input ref={ref} readOnly className={`${className ?? CLASSE_PADRAO} pr-8 cursor-pointer`} {...props} />
      <Icone className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
});
CampoComIcone.displayName = 'CampoComIcone';

export interface CampoDataProps {
  /** Data no formato 'YYYY-MM-DD', igual ao <input type="date"> nativo que este componente substitui. */
  value: string;
  onChange: (valorIso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 'YYYY-MM-DD' opcional — data mínima selecionável. */
  min?: string;
  /** 'YYYY-MM-DD' opcional — data máxima selecionável. */
  max?: string;
}

/** Substituto de <input type="date">. Mesma assinatura de value/onChange (string ISO), picker customizado. */
export function CampoData({ value, onChange, className, placeholder, disabled, min, max }: CampoDataProps) {
  return (
    <DatePicker
      selected={isoParaData(value)}
      onChange={(data) => onChange(dataParaIso(data))}
      dateFormat="dd/MM/yyyy"
      locale="pt-BR"
      placeholderText={placeholder ?? 'dd/mm/aaaa'}
      disabled={disabled}
      minDate={isoParaData(min) ?? undefined}
      maxDate={isoParaData(max) ?? undefined}
      customInput={<CampoComIcone icone="data" className={className} />}
      calendarClassName="core-vm-datepicker"
      popperPlacement="bottom-start"
      showPopperArrow={false}
      isClearable={!disabled && !!value}
    />
  );
}

export interface CampoHoraProps {
  /** Hora no formato 'HH:mm', igual ao <input type="time"> nativo que este componente substitui. */
  value: string;
  onChange: (valorHhmm: string) => void;
  className?: string;
  disabled?: boolean;
  /** Intervalo entre horários na lista, em minutos (padrão: 15). */
  intervaloMinutos?: number;
}

/** Substituto de <input type="time">. Mesma assinatura de value/onChange (string 'HH:mm'), picker customizado. */
export function CampoHora({ value, onChange, className, disabled, intervaloMinutos = 15 }: CampoHoraProps) {
  return (
    <DatePicker
      selected={horaParaData(value)}
      onChange={(data) => onChange(dataParaHora(data))}
      locale="pt-BR"
      showTimeSelect
      showTimeSelectOnly
      timeIntervals={intervaloMinutos}
      timeCaption="Hora"
      dateFormat="HH:mm"
      placeholderText="--:--"
      disabled={disabled}
      customInput={<CampoComIcone icone="hora" className={className} />}
      calendarClassName="core-vm-datepicker core-vm-timepicker"
      popperPlacement="bottom-start"
      showPopperArrow={false}
    />
  );
}
