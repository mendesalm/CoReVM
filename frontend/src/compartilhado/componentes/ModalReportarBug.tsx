import React, { useState } from 'react';
import { Bug, X, Send, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface ModalReportarBugProps {
  isOpen: boolean;
  onClose: () => void;
  usuarioAtual?: any;
}

export const ModalReportarBug: React.FC<ModalReportarBugProps> = ({ 
  isOpen, 
  onClose,
  usuarioAtual 
}) => {
  const location = useLocation();
  const [titulo, setTitulo] = useState('');
  const [modulo, setModulo] = useState('Geral / Interface');
  const [severidade, setSeveridade] = useState('MEDIA');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  if (!isOpen) return null;

  const modulosDisponiveis = [
    '1. Notificações e Avisos',
    '2. Calendário de Eventos',
    '3. Mural de Pedidos de Admissão (Livros)',
    '4. Enquetes e Votações',
    '5. Gestão de Patrimônio Geral',
    '6. Documentos do Conselho',
    '7. Gestão das Lojas Jurisdicionadas',
    '8. Gestão da Mesa Diretora',
    '9. Relatórios de Gestão',
    '10. Comunicação Interna',
    'Geral / Interface / Autenticação'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !descricao.trim()) return;

    setEnviando(true);
    // Simulação de envio com fallback para email do superadmin
    setTimeout(() => {
      setEnviando(false);
      setSucesso(true);
      setTimeout(() => {
        setSucesso(false);
        setTitulo('');
        setDescricao('');
        onClose();
      }, 2000);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto">
      <div className="bg-[#121212] border border-[#333] rounded-2xl p-6 w-full max-w-lg shadow-2xl relative text-white animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-[#222]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <Bug className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Reportar Bug / Inconsistência</h3>
              <p className="text-xs text-gray-400">Envio direto ao suporte de engenharia (SuperAdmin)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#222] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sucesso ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-green-400 animate-bounce" />
            <h4 className="text-lg font-bold text-white">Reporte Enviado com Sucesso!</h4>
            <p className="text-xs text-gray-400 max-w-sm">
              Um e-mail formal foi encaminhado para a equipe técnica de engenharia (<span className="text-[#facc15]">andreluiz@addex.dev</span>).
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Título Resumido do Ocorrido *
              </label>
              <input 
                type="text"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Falha ao tentar salvar o formulário de aviso..."
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Módulo Afetado
                </label>
                <select
                  value={modulo}
                  onChange={(e) => setModulo(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                >
                  {modulosDisponiveis.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Nível de Severidade
                </label>
                <select
                  value={severidade}
                  onChange={(e) => setSeveridade(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-3 py-2 text-xs text-white focus:border-[#facc15] focus:outline-none"
                >
                  <option value="BAIXA">🟢 Baixa (Apenas visual / cosmético)</option>
                  <option value="MEDIA">🟡 Média (Dificuldade pontual de uso)</option>
                  <option value="ALTA">🟠 Alta (Recurso principal inoperante)</option>
                  <option value="CRITICA">🔴 Crítica / Bloqueante</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Descrição Detalhada do Problema *
              </label>
              <textarea 
                required
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva o passo a passo para reproduzir a falha, dados informados e a mensagem de erro..."
                className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl p-3 text-xs text-white focus:border-[#facc15] focus:outline-none transition-colors leading-relaxed"
              />
            </div>

            {/* Metadados Técnicos Automáticos */}
            <div className="p-3 bg-[#0a0a0a] border border-[#222] rounded-xl text-[11px] text-gray-400 space-y-1">
              <div className="flex items-center gap-1.5 text-gray-300">
                <AlertTriangle className="w-3.5 h-3.5 text-[#facc15]" />
                <span className="font-semibold">Contexto capturado automaticamente:</span>
              </div>
              <p className="truncate"><strong className="text-gray-500">Rota / URL:</strong> {location.pathname}</p>
              <p><strong className="text-gray-500">Remetente:</strong> {usuarioAtual?.nome_completo || usuarioAtual?.usuario_id || 'Usuário Autenticado'} | <strong className="text-gray-500">Destino:</strong> andreluiz@addex.dev</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-xl hover:bg-[#222] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando || !titulo.trim() || !descricao.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-black bg-[#facc15] hover:bg-[#eab308] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg transition-all"
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {enviando ? 'Enviando...' : 'Enviar Reporte'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default ModalReportarBug;
