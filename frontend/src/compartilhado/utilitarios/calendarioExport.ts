// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
/**
 * Utilitários de exportação de eventos para calendários nativos (Google Calendar e Apple/ICS).
 */

export function gerarLinkGoogleCalendar(evento: {
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  dataInicio: string;
  dataFim?: string | null;
  diaInteiro?: boolean;
}): string {
  const formatarData = (dataStr: string, diaInteiro: boolean, isEnd = false) => {
    const d = new Date(dataStr);
    if (isNaN(d.getTime())) return '';
    if (diaInteiro) {
      if (isEnd) d.setDate(d.getDate() + 1);
      const ano = d.getUTCFullYear();
      const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dia = String(d.getUTCDate()).padStart(2, '0');
      return `${ano}${mes}${dia}`;
    }
    return d.toISOString().replace(/-|:|\.\d\d\d/g, '');
  };

  const start = formatarData(evento.dataInicio, !!evento.diaInteiro);
  const end = evento.dataFim
    ? formatarData(evento.dataFim, !!evento.diaInteiro, true)
    : start;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: evento.titulo,
    dates: `${start}/${end}`,
    details: evento.descricao || '',
    location: evento.local || 'Conselho Regional / Loja Maçônica',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function baixarArquivoIcs(evento: {
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  dataInicio: string;
  dataFim?: string | null;
  diaInteiro?: boolean;
}) {
  const dInicio = new Date(evento.dataInicio);
  const dFim = evento.dataFim 
    ? new Date(evento.dataFim) 
    : new Date(dInicio.getTime() + 2 * 60 * 60 * 1000); // 2 horas padrão
  
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtIcs = (d: Date) => 
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SiGMa CoReVM//Calendario Regional//PT',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@e-sigma.app`,
    `DTSTAMP:${fmtIcs(new Date())}`,
    `DTSTART:${fmtIcs(dInicio)}`,
    `DTEND:${fmtIcs(dFim)}`,
    `SUMMARY:${evento.titulo}`,
    `DESCRIPTION:${(evento.descricao || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${evento.local || 'Conselho Regional / Templo Maçônico'}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${evento.titulo.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
