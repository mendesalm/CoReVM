// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState } from 'react';
import axios from 'axios';
import { Search, Plus, Check } from 'lucide-react';
import ModalCadastroLoja from './ModalCadastroLoja';

const API_URL = 'http://localhost:8003/api/v1';

interface Props {
  onSelect: (loja: { id: number, nome: string, numero: string }) => void;
  onSelectMultiple?: (lojas: { id: number, nome: string, numero: string }[]) => void;
}

export default function BuscadorLoja({ onSelect, onSelectMultiple }: Props) {
  const [lojaBusca, setLojaBusca] = useState('');
  const [lojasEncontradas, setLojasEncontradas] = useState<any[]>([]);
  const [mostrarCadastroLoja, setMostrarCadastroLoja] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleBuscarLoja = async (termo: string) => {
    setLojaBusca(termo);
    if (termo.length < 3) {
      setLojasEncontradas([]);
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/integracao/lojas/busca?q=${termo}`);
      setLojasEncontradas(res.data);
      // Pré-marcar todas por padrão
      setSelectedIds(res.data.map((l: any) => l.id));
      
      if (res.data.length === 0) {
        setMostrarCadastroLoja(true);
      } else {
        setMostrarCadastroLoja(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSelection = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sId => sId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const confirmarSelecao = () => {
    const selecionadas = lojasEncontradas.filter(l => selectedIds.includes(l.id));
    if (selecionadas.length === 1) {
      onSelect({ id: selecionadas[0].id, nome: selecionadas[0].nome, numero: selecionadas[0].numero_loja });
    } else if (selecionadas.length > 1 && onSelectMultiple) {
      onSelectMultiple(selecionadas.map(l => ({ id: l.id, nome: l.nome, numero: l.numero_loja })));
    } else if (selecionadas.length > 1 && !onSelectMultiple) {
      // Fallback
      onSelect({ id: selecionadas[0].id, nome: selecionadas[0].nome, numero: selecionadas[0].numero_loja });
    }
    setLojaBusca('');
    setLojasEncontradas([]);
    setSelectedIds([]);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-gray-500" />
        </div>
        <input 
          type="text" 
          placeholder="Buscar Loja por Nome, Número ou Cidade (Mín. 3 caracteres)..." 
          value={lojaBusca}
          onChange={(e) => handleBuscarLoja(e.target.value)}
          className="w-full bg-[#080808] border border-[#333] rounded-lg pl-10 p-3 text-white focus:border-[#facc15] focus:outline-none" 
        />
      </div>

      {lojasEncontradas.length > 0 && lojaBusca.length >= 3 && (
          <div className="bg-[#080808] border border-[#333] rounded-lg overflow-hidden">
            <div className="p-3 bg-[#151515] border-b border-[#333] flex justify-between items-center">
              <span className="text-sm text-gray-400">{lojasEncontradas.length} lojas encontradas</span>
              <button 
                type="button" 
                disabled={selectedIds.length === 0}
                onClick={confirmarSelecao} 
                className="bg-[#facc15] text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> 
                {selectedIds.length > 1 ? `Adicionar ${selectedIds.length} Lojas` : 'Adicionar Loja Selecionada'}
              </button>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-[#111] text-gray-400">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <input 
                      type="checkbox" 
                      onChange={(e) => setSelectedIds(e.target.checked ? lojasEncontradas.map(l => l.id) : [])}
                      checked={lojasEncontradas.length > 0 && selectedIds.length === lojasEncontradas.length}
                      className="rounded bg-black border-[#333] text-[#facc15] focus:ring-[#facc15]"
                    />
                  </th>
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Loja</th>
                  <th className="px-4 py-3">Potência</th>
                  <th className="px-4 py-3">Cidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222]">
                {lojasEncontradas.map(loja => (
                  <tr key={loja.id} className="hover:bg-[#1a1a1a] transition-colors cursor-pointer" onClick={() => toggleSelection(loja.id)}>
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox"
                        checked={selectedIds.includes(loja.id)}
                        onChange={() => {}} // Controlled by tr onClick
                        className="rounded bg-black border-[#333] text-[#facc15] focus:ring-[#facc15]"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-mono">{loja.numero_loja || loja.numero}</td>
                    <td className="px-4 py-3 text-gray-200 font-medium">{loja.nome}</td>
                    <td className="px-4 py-3 text-[#facc15] font-semibold">{loja.sigla_potencia || loja.potencia || 'GLEG'}</td>
                    <td className="px-4 py-3 text-gray-400">{loja.cidade || 'N/I'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {mostrarCadastroLoja && (
        <div className="flex items-center justify-between p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-orange-500 text-sm">Nenhuma loja encontrada.</p>
          <button 
            type="button" 
            onClick={() => setMostrarCadastroLoja(true)} 
            className="bg-orange-500 text-black px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-400 transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Cadastrar Loja
          </button>
        </div>
      )}

      {mostrarCadastroLoja && (
        <ModalCadastroLoja 
          onSuccess={(loja) => {
            onSelect(loja);
            setMostrarCadastroLoja(false);
            setLojaBusca('');
          }}
          onCancel={() => setMostrarCadastroLoja(false)}
        />
      )}
    </div>
  );
}
