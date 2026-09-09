import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';

const API_URL = 'http://localhost:8003/api/v1';

export default function PaginaCalendario() {
  const { id: regiaoId } = useParams();
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Lojas da região para popular o campo "Dono do Evento"
  const [lojasRegiao, setLojasRegiao] = useState<{id: string, nome: string, numero: string}[]>([]);

  useEffect(() => {
    if (!regiaoId) return;
    const fetchLojas = async () => {
      try {
        const resDb = await axios.get(`${API_URL}/regional/${regiaoId}/dashboard`, {
          headers: { 'X-User-Id': 'superadmin' }
        });
        const lojaIds = (resDb.data.lojas || []).map((l: any) => parseInt(l.loja_id)).filter(Boolean);
        if (lojaIds.length > 0) {
          const resLojas = await axios.post(`${API_URL}/integracao/lojas/busca/multiplas`, lojaIds);
          setLojasRegiao(resLojas.data.map((l: any) => ({ id: String(l.id), nome: l.nome, numero: l.numero })));
        }
      } catch (e) {
        // sem lojas carregadas, datalist ficará com opções padrão
      }
    };
    fetchLojas();
  }, [regiaoId]);

  // Form State
  const [_eventId, setEventId] = useState('');
  const [title, setTitle] = useState('');
  const [dono, setDono] = useState('Conselho');
  const [detalhamento, setDetalhamento] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isAllDay, setIsAllDay] = useState(true);
  const [color, setColor] = useState('#eab308');

  // Eventos - sem dados fake, começa vazio
  const [events, setEvents] = useState<any[]>([]);

  const resetForm = () => {
    setEventId(''); setTitle(''); setDono('Conselho'); setDetalhamento('');
    setStartDate(''); setStartTime(''); setEndDate(''); setEndTime('');
    setIsAllDay(true); setColor('#eab308');
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

  const handleSalvarEvento = () => {
    if (!title.trim()) return;
    const start = isAllDay ? startDate : `${startDate}T${startTime || '00:00'}`;
    const end = endDate ? (isAllDay ? endDate : `${endDate}T${endTime || '00:00'}`) : undefined;
    const novoEvento = {
      id: _eventId || String(Date.now()),
      title,
      extendedProps: { dono, detalhamento },
      start,
      end,
      allDay: isAllDay,
      backgroundColor: color,
      borderColor: color,
    };
    if (isEditing && _eventId) {
      setEvents(prev => prev.map(e => e.id === _eventId ? novoEvento : e));
    } else {
      setEvents(prev => [...prev, novoEvento]);
    }
    setShowModal(false);
    resetForm();
  };

  const handleExcluirEvento = () => {
    if (_eventId) setEvents(prev => prev.filter(e => e.id !== _eventId));
    setShowModal(false);
    resetForm();
  };

  const handleEventDrop = (info: any) => {
    setEvents(prev => prev.map(e =>
      e.id === info.event.id
        ? { ...e, start: info.event.startStr, end: info.event.endStr || undefined, allDay: info.event.allDay }
        : e
    ));
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
            
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleSalvarEvento(); }}>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Título do Evento</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Reunião de Veneráveis..." required className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Organizador / Dono do Evento</label>
                <div className="relative">
                  <input type="text" list="donos-lista" value={dono} onChange={e => setDono(e.target.value)} placeholder="Ex: Loja 901, Conselho, Externo" className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
                  <datalist id="donos-lista">
                    <option value="Conselho" />
                    <option value="Externo" />
                    {lojasRegiao.map(l => (
                      <option key={l.id} value={`Loja ${l.numero} — ${l.nome.replace('[TESTE-CORE] ', '')}`} />
                    ))}
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
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:border-[#facc15] focus:outline-none" />
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

              {/* Color Picker — swatches rápidos + input nativo */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Cor de Destaque</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { hex: '#eab308', label: 'Ouro' },
                    { hex: '#dc2626', label: 'Urgente' },
                    { hex: '#2563eb', label: 'Cerimonial' },
                    { hex: '#16a34a', label: 'Social' },
                    { hex: '#7c3aed', label: 'Especial' },
                    { hex: '#0891b2', label: 'Info' },
                    { hex: '#ea580c', label: 'Alerta' },
                  ].map(s => (
                    <button
                      key={s.hex}
                      type="button"
                      title={s.label}
                      onClick={() => setColor(s.hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${color === s.hex ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: s.hex }}
                    />
                  ))}
                  {/* Input nativo para cor personalizada */}
                  <label className="cursor-pointer" title="Cor personalizada">
                    <div
                      className={`w-7 h-7 rounded-full border-2 overflow-hidden flex items-center justify-center bg-gradient-to-br from-pink-500 via-yellow-400 to-blue-500 hover:scale-110 transition-transform ${!['#eab308','#dc2626','#2563eb','#16a34a','#7c3aed','#0891b2','#ea580c'].includes(color) ? 'border-white scale-110' : 'border-transparent'}`}
                    />
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="sr-only" />
                  </label>
                  {/* Preview da cor selecionada */}
                  <div className="flex items-center gap-2 ml-2 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs text-gray-400 font-mono">{color}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#333] pt-4 flex justify-between items-center mt-4">
                {isEditing ? (
                  <button type="button" onClick={handleExcluirEvento} className="text-red-500 hover:text-red-400 text-sm font-semibold transition-colors">Excluir Evento</button>
                ) : <div />}
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancelar</button>
                  <button type="submit" className="bg-[#facc15] hover:bg-[#eab308] text-black px-6 py-2 rounded-lg font-semibold transition-colors">{isEditing ? 'Atualizar Evento' : 'Salvar Evento'}</button>
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
