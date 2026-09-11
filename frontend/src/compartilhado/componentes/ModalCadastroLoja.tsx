// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';

interface Props {
  onSuccess: (loja: any) => void;
  onCancel: () => void;
}

const API_URL = 'http://localhost:8003/api/v1';

export default function ModalCadastroLoja({ onSuccess, onCancel }: Props) {
  const [formData, setFormData] = useState({
    nome_loja: '',
    numero_loja: '',
    titulo_loja: 'ARLS',
    rito: 'REAA', // ALTERAÇÃO (2026-09-11): valor canônico passou a ser a sigla, não o nome completo.
    potencia_id: 1, // Exemplo GOB (nível Potência) — ALTERAÇÃO (2026-09-11): campo renomeado de obediencia_id.
    cidade: '',
    estado: 'GO',
    cep: ''
  });
  const [loading, setLoading] = useState(false);

  const fetchCep = async (cep: string) => {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    try {
      const res = await axios.get(`https://viacep.com.br/ws/${limpo}/json/`);
      if (!res.data.erro) {
        setFormData({ ...formData, cep: limpo, cidade: res.data.localidade, estado: res.data.uf.toUpperCase() });
      }
    } catch (err) {
      console.error("Erro ao buscar CEP", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/integracao/lojas/`, formData);
      onSuccess({
        id: res.data.loja_id, // ID interno (lojas_db)
        nome: res.data.nome,
        numero: formData.numero_loja,
      });
    } catch (err: any) {
      console.error("Erro ao cadastrar Loja", err);
      alert(err.response?.data?.detail || "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#111] border border-[#333] rounded-xl p-8 w-full max-w-xl">
        <h2 className="text-xl font-bold text-[#facc15] mb-4">Cadastro Rápido de Loja</h2>
        <p className="text-sm text-gray-400 mb-6">Esta loja não foi encontrada no banco. Preencha os dados básicos para registrar no sistema.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400">Título</label>
              <select value={formData.titulo_loja} onChange={e => setFormData({...formData, titulo_loja: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white">
                <option value="ARLS">ARLS (Simbólica)</option>
                <option value="ARBLS">ARBLS (Benemérita)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400">Número</label>
              <input type="number" required value={formData.numero_loja} onChange={e => setFormData({...formData, numero_loja: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400">Nome da Loja</label>
            <input type="text" required value={formData.nome_loja} onChange={e => setFormData({...formData, nome_loja: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
          </div>

          <div>
            <label className="block text-sm text-gray-400">Rito</label>
            <select value={formData.rito} onChange={e => setFormData({...formData, rito: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white">
              <option value="REAA">REAA</option>
              <option value="Rito York">York</option>
              <option value="Rito Brasileiro">Brasileiro</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-[#333] pt-4 mt-2">
            <div>
              <label className="block text-sm text-gray-400">CEP</label>
              <input type="text" maxLength={9} onBlur={(e) => fetchCep(e.target.value)} value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-400">Cidade / UF</label>
              <div className="flex gap-2">
                <input type="text" required value={formData.cidade} onChange={e => setFormData({...formData, cidade: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-2 text-white" placeholder="Cidade" />
                <input type="text" required maxLength={2} value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value.toUpperCase()})} className="w-16 bg-[#080808] border border-[#333] rounded-lg p-2 text-white" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-[#facc15] text-black font-semibold rounded-lg">
              {loading ? "Salvando..." : "Cadastrar Loja"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
