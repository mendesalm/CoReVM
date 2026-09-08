import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatarCPF, formatarTelefone } from '../utils/formatadores';
import { Loader2, CheckCircle2, UserCheck, AlertCircle } from 'lucide-react';

interface Props {
  cargoPadrao?: string;
  lojasDisponiveis: {id: number, nome: string}[];
  onSuccess: (cim: string) => void;
  onCancel: () => void;
}

const API_URL = 'http://localhost:8003/api/v1';

const cargosComuns = [
  "Mestre",
  "Venerável Mestre",
  "Primeiro Vigilante",
  "Segundo Vigilante",
  "Orador",
  "Secretário",
  "Tesoureiro",
  "Chanceler",
  "Mestre de Harmonia",
  "Hospitaleiro"
];

export default function ModalCadastroObreiro({ cargoPadrao, lojasDisponiveis, onSuccess, onCancel }: Props) {
  const [formData, setFormData] = useState({
    cim: '',
    nome_completo: '',
    email: '',
    cpf: '',
    telefone: '',
    loja_id: lojasDisponiveis.length > 0 ? lojasDisponiveis[0].id : 0,
    cargo_atual: cargoPadrao || 'Mestre',
    data_inicio_mandato: new Date().toISOString().split('T')[0]
  });
  
  const [loading, setLoading] = useState(false);
  const [buscandoCim, setBuscandoCim] = useState(false);
  const [obreiroLocalizado, setObreiroLocalizado] = useState<boolean | null>(null);
  const [mensagemBusca, setMensagemBusca] = useState('');

  // Busca instantânea por CIM
  const buscarPorCim = async (cimValue: string) => {
    const termo = cimValue.trim();
    if (termo.length < 3) {
      setObreiroLocalizado(null);
      setMensagemBusca('');
      return;
    }

    setBuscandoCim(true);
    try {
      const res = await axios.get(`${API_URL}/integracao/obreiros/busca/${termo}`);
      const o = res.data;
      setFormData(prev => ({
        ...prev,
        nome_completo: o.nome_completo || prev.nome_completo,
        email: o.email || prev.email,
        cpf: o.cpf ? formatarCPF(o.cpf) : prev.cpf,
        telefone: o.telefone ? formatarTelefone(o.telefone) : prev.telefone
      }));
      setObreiroLocalizado(true);
      setMensagemBusca(`Membro localizado: ${o.nome_completo}`);
    } catch (err: any) {
      setObreiroLocalizado(false);
      setMensagemBusca('Novo obreiro no e-Sigma. Preencha os campos para cadastro inicial.');
    } finally {
      setBuscandoCim(false);
    }
  };

  const handleCimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawCim = e.target.value.replace(/\D/g, '');
    setFormData({ ...formData, cim: rawCim });
    buscarPorCim(rawCim);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.loja_id === 0) {
      alert("Selecione uma loja para vincular o obreiro.");
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        ...formData,
        cpf: formData.cpf ? formData.cpf.replace(/\D/g, '') : null
      };
      const res = await axios.post(`${API_URL}/integracao/obreiros/`, payload);
      onSuccess(res.data.cim);
    } catch (err: any) {
      console.error("Erro ao cadastrar Obreiro", err);
      alert(err.response?.data?.detail || "Erro ao registrar obreiro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-[#111] border border-[#333] rounded-xl p-8 w-full max-w-xl my-auto shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-[#facc15]/10 rounded-lg text-[#facc15]">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#facc15]">
              {cargoPadrao ? `Atribuir ${cargoPadrao}` : 'Vincular Membro à Loja'}
            </h2>
            <p className="text-xs text-gray-400">Informe o CIM para busca automática ou realize o cadastro direto.</p>
          </div>
        </div>

        {/* Feedback visual de localização */}
        {obreiroLocalizado === true && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 my-4 flex items-center gap-2 text-xs text-green-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{mensagemBusca} (Dados auto-preenchidos).</span>
          </div>
        )}

        {obreiroLocalizado === false && formData.cim.length >= 3 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 my-4 flex items-center gap-2 text-xs text-[#facc15]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{mensagemBusca}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                CIM <span className="text-[#facc15] font-bold">*</span>
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  required 
                  value={formData.cim} 
                  onChange={handleCimChange}
                  placeholder="Ex: 314445"
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none" 
                />
                {buscandoCim && (
                  <div className="absolute right-3 top-3">
                    <Loader2 className="w-4 h-4 text-[#facc15] animate-spin" />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                CPF <span className="text-gray-500 font-normal lowercase">(opcional)</span>
              </label>
              <input 
                type="text" 
                value={formData.cpf} 
                onChange={e => setFormData({...formData, cpf: formatarCPF(e.target.value)})} 
                placeholder="000.000.000-00" 
                maxLength={14} 
                className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none" 
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
              Nome Completo do Obreiro <span className="text-[#facc15] font-bold">*</span>
            </label>
            <input 
              type="text" 
              required 
              value={formData.nome_completo} 
              onChange={e => setFormData({...formData, nome_completo: e.target.value})} 
              placeholder="Nome do obreiro..."
              className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                E-mail Pessoal <span className="text-[#facc15] font-bold">*</span>
              </label>
              <input 
                type="email" 
                required
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
                placeholder="obreiro@exemplo.com"
                className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                WhatsApp / Telefone <span className="text-gray-500 font-normal lowercase">(opcional)</span>
              </label>
              <input 
                type="text" 
                value={formData.telefone} 
                onChange={e => setFormData({...formData, telefone: formatarTelefone(e.target.value)})} 
                placeholder="(00) 00000-0000"
                maxLength={15} 
                className="w-full bg-[#080808] border border-[#333] rounded-lg p-2.5 text-sm text-white focus:border-[#facc15] focus:outline-none" 
              />
            </div>
          </div>

          <div className="border-t border-[#333] pt-4 mt-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Vínculo com a Loja e Mandato</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Loja Jurisdicionada</label>
                <select 
                  value={formData.loja_id} 
                  onChange={e => setFormData({...formData, loja_id: parseInt(e.target.value)})} 
                  className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-xs text-white"
                >
                  {lojasDisponiveis.map(l => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cargo no Mandato</label>
                {cargoPadrao ? (
                  <input type="text" readOnly value={formData.cargo_atual} className="w-full bg-[#222] border border-[#333] rounded-lg p-2 text-xs text-gray-300 cursor-not-allowed font-semibold" />
                ) : (
                  <select value={formData.cargo_atual} onChange={e => setFormData({...formData, cargo_atual: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-xs text-white">
                    {cargosComuns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Data de Início do Mandato</label>
                <input type="date" value={formData.data_inicio_mandato} onChange={e => setFormData({...formData, data_inicio_mandato: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-xs text-white" />
              </div>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex gap-3 text-xs text-blue-400 mt-4">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p>Ao salvar, o vínculo da loja e o mandato serão registrados imediatamente, gerando acesso ao CoReVM.</p>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg font-medium text-xs text-gray-400 hover:text-white transition-colors" disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="bg-[#facc15] hover:bg-[#eab308] text-black px-6 py-2 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50" disabled={loading}>
              {loading ? 'Processando...' : (obreiroLocalizado ? 'Confirmar e Atribuir' : 'Cadastrar e Atribuir')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
