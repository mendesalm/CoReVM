// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { formatarCPF, formatarTelefone } from '../utils/formatadores';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.loja_id === 0) {
      alert("Selecione uma loja para vincular o obreiro.");
      return;
    }
    
    setLoading(true);
    try {
      // Backend espera CPF e telefone formatados ou apenas números, mas a rota de obrigatoriedade
      // já lida com cpf. E telefone é opcional mas enviamos tudo.
      const payload = {
        ...formData,
        cpf: formData.cpf.replace(/\D/g, '') // Envia só números conforme regra ouro
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#111] border border-[#333] rounded-xl p-8 w-full max-w-xl">
        <h2 className="text-xl font-bold text-[#facc15] mb-4">Cadastro Rápido de Membro</h2>
        <p className="text-sm text-gray-400 mb-6">Membro não encontrado no e-Sigma IdP. Realize o cadastro básico.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400">CIM</label>
              <input type="text" required value={formData.cim} onChange={e => setFormData({...formData, cim: e.target.value.replace(/\D/g, '')})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400">CPF</label>
              <input type="text" required value={formData.cpf} onChange={e => setFormData({...formData, cpf: formatarCPF(e.target.value)})} placeholder="Apenas números" maxLength={14} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400">Nome Completo</label>
            <input type="text" required value={formData.nome_completo} onChange={e => setFormData({...formData, nome_completo: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400">E-mail Pessoal</label>
              <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400">WhatsApp (Telefone)</label>
              <input type="text" value={formData.telefone} onChange={e => setFormData({...formData, telefone: formatarTelefone(e.target.value)})} maxLength={15} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
            </div>
          </div>

          <div className="border-t border-[#333] pt-4 mt-2">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Vínculo Inicial & Diretoria</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400">Loja Base</label>
                <select value={formData.loja_id} onChange={e => setFormData({...formData, loja_id: parseInt(e.target.value)})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white">
                  {lojasDisponiveis.map(l => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400">Cargo Atual</label>
                {cargoPadrao ? (
                  <input type="text" readOnly value={formData.cargo_atual} className="w-full bg-[#222] border border-[#333] rounded-lg p-2 text-gray-400 cursor-not-allowed" />
                ) : (
                  <select value={formData.cargo_atual} onChange={e => setFormData({...formData, cargo_atual: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white">
                    {cargosComuns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
            </div>
            
            {!cargoPadrao && formData.cargo_atual !== 'Mestre' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400">Início do Mandato</label>
                  <input type="date" value={formData.data_inicio_mandato} onChange={e => setFormData({...formData, data_inicio_mandato: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
                </div>
              </div>
            )}
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex gap-3 text-sm text-blue-400 mt-4">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p>Ao salvar, uma senha provisória de acesso ao CoReVM será gerada e enviada para o e-mail do obreiro.</p>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors" disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="bg-[#facc15] hover:bg-[#eab308] text-black px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50" disabled={loading}>
              {loading ? 'Cadastrando...' : 'Salvar Cadastro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
