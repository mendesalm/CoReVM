import { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';

export default function PaginaCalendario() {
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form State
  const [_eventId, setEventId] = useState('');
  const [title, setTitle] = useState('');
  const [dono, setDono] = useState('Conselho');
  const [detalhamento, setDetalhamento] = useState(''); // Novo estado para info extra
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isAllDay, setIsAllDay] = useState(true);
  const [color, setColor] = useState('#eab308');

  const [events, _setEvents] = useState([
    { id: '1', title: 'Sessão Conjunta', dono: 'Conselho', detalhamento: 'Sessão magna de posse conjunta com todas as lojas.', start: '2026-09-15', allDay: true, backgroundColor: '#eab308', borderColor: '#854d0e' },
    { id: '2', title: 'Palestra Pública', dono: 'Externo', detalhamento: 'Traje esporte fino. Entrada franca para familiares.', start: '2026-09-22T19:30:00', end: '2026-09-22T21:30:00', allDay: false, backgroundColor: '#1e3a8a', borderColor: '#1e40af' },
    { id: '3', title: 'Banquetes Ritualísticos', dono: 'Loja 2181', detalhamento: 'Levar paramentos completos.', start: '2026-09-25', end: '2026-09-28', allDay: true, backgroundColor: '#dc2626', borderColor: '#991b1b' },
  ]);

  const resetForm = () => {
    setEventId(''); setTitle(''); setDono('Conselho'); setDetalhamento(''); setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setIsAllDay(true); setColor('#eab308');
  };

  const handleDateClick = (arg: any) => {
    resetForm();
    setStartDate(arg.dateStr);
    setEndDate(arg.dateStr);
    setIsEditing(false);
    setShowModal(true);
  };

  const handleEventClick = (arg: any) => {
    const ev = arg.event;
    setEventId(ev.id);
    setTitle(ev.title);
    setDono(ev.extendedProps.dono || 'Conselho');
    setDetalhamento(ev.extendedProps.detalhamento || '');
    setIsAllDay(ev.allDay);
    setColor(ev.backgroundColor);
    
    const startStr = ev.startStr.split('T');
    setStartDate(startStr[0]);
    if (startStr[1]) setStartTime(startStr[1].substring(0, 5));

    if (ev.endStr) {
      const endStr = ev.endStr.split('T');
      setEndDate(endStr[0]);
      if (endStr[1]) setEndTime(endStr[1].substring(0, 5));
    } else {
      setEndDate(startStr[0]);
    }

    setIsEditing(true);
    setShowModal(true);
  };

  const handleEventDrop = (info: any) => {
    console.log(`Evento movido para ${info.event.startStr}`);
  };

  // Customização visual da Tag do Evento
  const renderEventContent = (eventInfo: any) => {
    return (
      <div className="flex flex-col p-0.5 px-1 overflow-hidden w-full text-white">
        <span className="font-semibold text-xs truncate leading-tight">{eventInfo.event.title}</span>
        {eventInfo.event.extendedProps.dono && (
          <span className="opacity-75 truncate text-[9px] uppercase tracking-wider font-bold mt-0.5 border-t border-white/20 pt-0.5">
            {eventInfo.event.extendedProps.dono}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#facc15]">Calendário Regional</h1>
        <p className="text-gray-400 mt-2">Clique num dia para criar, ou clique em um evento existente para editá-lo.</p>
      </div>

      <div className="bg-[#111111] border border-[#333] rounded-xl p-6 flex-1 text-gray-300">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
          editable={true}
          droppable={true}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          height="100%"
          locale={ptBrLocale}
          buttonText={{
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia',
          }}
        />
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-[#111] border border-[#333] rounded-xl p-6 w-full max-w-lg my-auto">
            <h2 className="text-xl font-bold text-[#facc15] mb-4">
              {isEditing ? 'Editar Evento Regional' : 'Novo Evento Regional'}
            </h2>
            
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Título do Evento</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Reunião de Veneráveis..." className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Organizador / Dono do Evento</label>
                <div className="relative">
                  <input type="text" list="donos" value={dono} onChange={e => setDono(e.target.value)} placeholder="Ex: Loja 2181, Conselho, Externo" className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
                  <datalist id="donos">
                    <option value="Conselho" />
                    <option value="Externo" />
                    <option value="Loja 2181" />
                    <option value="Loja 3333" />
                  </datalist>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Detalhamento / Informações Extras</label>
                <textarea 
                  value={detalhamento} 
                  onChange={e => setDetalhamento(e.target.value)} 
                  placeholder="Instruções sobre trajes, pauta, links ou detalhes adicionais..." 
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none resize-none h-24" 
                />
              </div>

              <div className="flex items-center gap-2 py-1">
                <input type="checkbox" id="allday" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} className="w-4 h-4 accent-[#facc15] bg-[#080808] border-[#333] rounded" />
                <label htmlFor="allday" className="text-sm font-medium text-gray-300 cursor-pointer">Dia Inteiro (Sem horário fixo)</label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Data de Início</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
                </div>
                {!isAllDay && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Hora de Início</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Data de Término</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
                </div>
                {!isAllDay && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Hora de Término</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Cor de Destaque</label>
                <select value={color} onChange={e => setColor(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none">
                  <option value="#eab308">Ouro (Geral)</option>
                  <option value="#dc2626">Vermelho (Urgente)</option>
                  <option value="#2563eb">Azul (Cerimonial)</option>
                </select>
              </div>

              <div className="border-t border-[#333] pt-4 flex justify-between items-center mt-4">
                {isEditing ? (
                  <button type="button" className="text-red-500 hover:text-red-400 text-sm font-semibold transition-colors">Excluir Evento</button>
                ) : <div></div>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancelar</button>
                  <button type="button" onClick={() => setShowModal(false)} className="bg-[#facc15] hover:bg-[#eab308] text-black px-6 py-2 rounded-lg font-semibold transition-colors">{isEditing ? 'Atualizar Evento' : 'Salvar Evento'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <style>{`
        .fc-theme-standard .fc-scrollgrid, .fc-theme-standard th, .fc-theme-standard td { border-color: #333; }
        .fc-col-header-cell-cushion { color: #facc15; }
        .fc-daygrid-day-number { color: #aaa; }
        .fc-button-primary { background-color: #333 !important; border-color: #444 !important; }
        .fc-button-primary:hover { background-color: #444 !important; }
        .fc-button-active { background-color: #facc15 !important; color: black !important; border-color: #facc15 !important; }
        .fc .fc-toolbar-title { color: #fff; font-weight: bold; }
        .fc-event { cursor: pointer; border-radius: 4px; overflow: hidden; margin-bottom: 2px !important; }
        .fc-daygrid-event-harness { margin-top: 2px !important; }
      `}</style>
    </div>
  );
}
