// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, Users, FileText, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import BuscadorLoja from '../../compartilhado/componentes/BuscadorLoja';
import ModalCadastroObreiro from '../../compartilhado/componentes/ModalCadastroObreiro';

const API_URL = 'http://localhost:8003/api/v1';

export default function PainelConselho() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conselho, setConselho] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [addObreiroModal, setAddObreiroModal] = useState<any>(null);
  const [addSuplenteModal, setAddSuplenteModal] = useState<any>(null);
  const [showAddLojaModal, setShowAddLojaModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Função para carregar os dados do conselho
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const tokenSimuladoIdP = "CIM_12345_PRESIDENTE";
      const res = await axios.get(`${API_URL}/regional/${id}/dashboard`, {
        headers: { 'X-User-Id': tokenSimuladoIdP }
      });
      const data = res.data;

      if (data.lojas && data.lojas.length > 0) {
        const ids = data.lojas.map((l: any) => parseInt(l.loja_id)).filter((n: number) => !isNaN(n));
        if (ids.length > 0) {
          const [detailsRes, vmStatusRes] = await Promise.all([
            axios.post(`${API_URL}/integracao/lojas/busca/multiplas`, ids),
            axios.post(`${API_URL}/integracao/lojas/status_vm`, ids)
          ]);
          data.lojas = data.lojas.map((l: any) => {
            const det = detailsRes.data.find((d: any) => String(d.id) === String(l.loja_id));
            const hasVm = vmStatusRes.data[l.loja_id];
            return { ...l, nome: det?.nome, numero: det?.numero, cidade: det?.cidade, potencia: det?.potencia, rito: det?.rito, hasVm };
          });
          // Ordena por Potência e depois por Número da Loja
          data.lojas.sort((a: any, b: any) => {
            const potA = a.potencia || '';
            const potB = b.potencia || '';
            if (potA !== potB) return potA.localeCompare(potB);
            return (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0);
          });
        }
      }
      setConselho(data);
    } catch (err: any) {
      setErro(err.response?.data?.detail || "Acesso negado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDashboard();
  }, [id, reloadKey]);

  // Vincular uma nova loja ao conselho
  const vincularLoja = async (lojaId: number) => {
    try {
      await axios.post(`${API_URL}/regional/${id}/lojas`, { loja_id: lojaId.toString() }, {
        headers: { 'X-User-Id': 'CIM_12345_PRESIDENTE' }
      });
      alert('Loja vinculada ao conselho com sucesso!');
      setShowAddLojaModal(false);
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao vincular loja');
    }
  };

  // Remover uma loja do conselho
  const removerLoja = async (lojaId: string) => {
    if (!confirm('Deseja realmente remover esta loja do conselho?')) return;
    try {
      await axios.delete(`${API_URL}/regional/${id}/lojas/${lojaId}`, {
        headers: { 'X-User-Id': 'CIM_12345_PRESIDENTE' }
      });
      alert('Loja removida com sucesso!');
      setReloadKey(k => k + 1);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Erro ao remover loja');
    }
  };

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
        {/* Cards de resumo */}
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
              <p className="text-gray-400 text-sm">Veneráveis Cadastrados</p>
              <h2 className="text-3xl font-bold text-white">{conselho?.lojas?.filter((l: any) => l.hasVm).length || 0}</h2>
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

        {/* Tabela de Lojas */}
        <div className="bg-[#151515] border border-[#333] rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-[#facc15]">Lojas do Conselho</h3>
            <button onClick={() => setShowAddLojaModal(true)} className="bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 rounded-lg font-semibold text-sm transition-colors">+ Adicionar Loja</button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#333] text-sm text-gray-500 uppercase">
                  <th className="p-3">Loja</th>
                  <th className="p-3">Potência</th>
                  <th className="p-3">Oriente</th>
                  <th className="p-3">Rito</th>
                  <th className="p-3">Venerável Mestre</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {conselho?.lojas?.map((rel: any) => (
                  <tr key={rel.id} className="border-b border-[#222] hover:bg-[#111] transition-colors text-xs">
                    <td className="p-3 font-medium text-white">{rel.nome ? `${rel.nome.replace(/^Loja\s+/i, '')}, nº ${rel.numero}` : `Ref: ${rel.loja_id}`}</td>
                    <td className="p-3 text-gray-400">{rel.potencia || '-'}</td>
                    <td className="p-3 text-gray-400">{rel.cidade || '-'}</td>
                    <td className="p-3 text-gray-400 truncate max-w-[150px]" title={rel.rito}>{rel.rito ? rel.rito.replace(/^Rito\s+/i, '') : '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full ${rel.hasVm ? 'bg-[#222] text-green-400' : 'bg-red-500/20 text-red-400 font-bold'}`}>
                        {rel.hasVm ? rel.hasVm : 'Pendente'}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => removerLoja(rel.loja_id)} className="text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-1 rounded">Remover</button>
                      <button onClick={() => setAddObreiroModal(rel)} className="text-[#facc15] hover:text-[#eab308] bg-[#facc15]/10 px-2 py-1 rounded">+ VM</button>
                      <button onClick={() => setAddSuplenteModal(rel)} className="text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-1 rounded">+ Suplente</button>
                    </td>
                  </tr>
                ))}
                {conselho?.lojas?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">Nenhuma loja cadastrada neste conselho ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
      </div>

      {/* Modal: Adicionar Loja ao Conselho */}
      {showAddLojaModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#111] border border-[#333] rounded-xl p-8 w-full max-w-xl">
            <h2 className="text-xl font-bold text-[#facc15] mb-2">Adicionar Loja ao Conselho</h2>
            <p className="text-sm text-gray-400 mb-6">Busque pelo nome ou número da loja no banco global.</p>
            <BuscadorLoja onSelect={(loja) => vincularLoja(loja.id)} />
            <div className="flex justify-end mt-6">
              <button onClick={() => setShowAddLojaModal(false)} className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cadastro de Venerável Mestre */}
      {addObreiroModal && (
        <ModalCadastroObreiro 
          cargoPadrao="Venerável Mestre"
          lojasDisponiveis={[{ id: parseInt(addObreiroModal.loja_id), nome: addObreiroModal.nome || 'Loja' }]}
          onSuccess={(cim: string) => {
            alert(`Venerável Mestre CIM ${cim} cadastrado com sucesso! E-mail com senha provisória enviado.`);
            setAddObreiroModal(null);
            setReloadKey(k => k + 1);
          }}
          onCancel={() => setAddObreiroModal(null)}
        />
      )}

      {/* Modal: Cadastro de Suplente */}
      {addSuplenteModal && (
        <ModalCadastroObreiro 
          lojasDisponiveis={[{ id: parseInt(addSuplenteModal.loja_id), nome: addSuplenteModal.nome || 'Loja' }]}
          onSuccess={(cim: string) => {
            alert(`Suplente CIM ${cim} cadastrado com sucesso! E-mail com senha provisória enviado.`);
            setAddSuplenteModal(null);
            setReloadKey(k => k + 1);
          }}
          onCancel={() => setAddSuplenteModal(null)}
        />
      )}
    </div>
  );
}
