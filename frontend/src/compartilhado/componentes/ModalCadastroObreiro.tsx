// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';

interface Props {
  cargoPadrao?: string;
  lojasDisponiveis: {id: number, nome: string}[];
  onSuccess: (cim: string) => void;
  onCancel: () => void;
}

const API_URL = 'http://localhost:8003/api/v1';

export default function ModalCadastroObreiro({ cargoPadrao, lojasDisponiveis, onSuccess, onCancel }: Props) {
  const [formData, setFormData] = useState({
    cim: '',
    nome_completo: '',
    email: '',
    cpf: '',
    telefone: '',
    loja_id: lojasDisponiveis.length > 0 ? lojasDisponiveis[0].id : 0,
    cargo_loja: cargoPadrao || 'Mestre'
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
      const res = await axios.post(`${API_URL}/integracao/obreiros/`, formData);
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
              <input type="text" required value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} placeholder="Apenas números" maxLength={14} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
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
              <input type="text" required value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
            </div>
          </div>

          <div className="border-t border-[#333] pt-4 mt-2">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Vínculo Inicial (Obrigatório)</h3>
            <div className="grid grid-cols-2 gap-4">
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
                <input type="text" readOnly={!!cargoPadrao} value={formData.cargo_loja} onChange={e => setFormData({...formData, cargo_loja: e.target.value})} className="w-full bg-[#222] border border-[#333] rounded-lg p-2 text-gray-400 cursor-not-allowed" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-[#facc15] text-black font-semibold rounded-lg">
              {loading ? "Registrando..." : "Cadastrar Membro"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
