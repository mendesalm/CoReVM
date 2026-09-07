// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, Users, FileText, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

export default function PainelConselho() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conselho, setConselho] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    // Simulando o Token do Usuário logado via Header (Em prod, seria via axios.interceptors)
    const tokenSimuladoIdP = "CIM_12345_PRESIDENTE"; // Mock

    axios.get(`${API_URL}/regional/${id}/dashboard`, {
      headers: { 'X-User-Id': tokenSimuladoIdP }
    })
      .then(res => setConselho(res.data))
      .catch(err => {
        setErro(err.response?.data?.detail || "Acesso negado. Você não pertence à diretoria.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="h-screen bg-[#080808] flex items-center justify-center"><Loader2 className="w-12 h-12 text-[#facc15] animate-spin" /></div>;
  if (erro) return <div className="h-screen bg-[#080808] flex items-center justify-center flex-col gap-4 text-orange-500 font-bold"><ShieldCheck className="w-16 h-16"/> {erro}</div>;

  return (
    <div className="min-h-screen bg-[#080808] text-gray-200">
      <div className="bg-[#111] border-b border-[#333] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-[#222] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#facc15] uppercase tracking-widest">{conselho?.nome}</h1>
              <p className="text-sm text-green-500 flex items-center gap-1"><ShieldCheck className="w-4 h-4"/> Acesso Autorizado - Gestão Regional</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#151515] p-6 rounded-xl border border-[#333] shadow-lg flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg"><Building2 className="w-8 h-8 text-blue-500"/></div>
            <div>
              <p className="text-gray-400 text-sm">Lojas Jurisdicionadas</p>
              <h2 className="text-3xl font-bold text-white">{conselho?.lojas?.length || 0}</h2>
            </div>
          </div>

          <div className="bg-[#151515] p-6 rounded-xl border border-[#333] shadow-lg flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg"><Users className="w-8 h-8 text-green-500"/></div>
            <div>
              <p className="text-gray-400 text-sm">Veneráveis Mestres</p>
              <h2 className="text-3xl font-bold text-white">{conselho?.lojas?.length || 0}</h2> {/* Proxy 1 pra 1 por enquanto */}
            </div>
          </div>

          <div className="bg-[#151515] p-6 rounded-xl border border-[#333] shadow-lg flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 rounded-lg"><FileText className="w-8 h-8 text-purple-500"/></div>
            <div>
              <p className="text-gray-400 text-sm">Atas Recebidas</p>
              <h2 className="text-3xl font-bold text-white">0</h2>
            </div>
          </div>
        </div>

        <div className="bg-[#151515] border border-[#333] rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-[#facc15]">Lojas do Conselho</h3>
            <button className="bg-[#facc15] text-black px-4 py-2 rounded-lg font-semibold text-sm">Adicionar Loja / Venerável</button>
          </div>
          
          <div className="space-y-3">
            {conselho?.lojas?.map((rel: any) => (
              <div key={rel.id} className="p-4 bg-[#080808] border border-[#333] rounded-lg flex justify-between items-center hover:border-[#555] transition-colors cursor-pointer">
                <div>
                  <h4 className="font-bold text-white text-lg">Loja Ref: {rel.loja_id}</h4>
                  <p className="text-sm text-gray-500">Filiada em: {rel.data_filiacao}</p>
                </div>
                <div className="bg-[#222] text-xs px-3 py-1 rounded-full text-green-400">Status OK</div>
              </div>
            ))}
            {conselho?.lojas?.length === 0 && <p className="text-gray-500">Nenhuma loja cadastrada neste conselho ainda.</p>}
          </div>
        </div>
        
      </div>
    </div>
  );
}
