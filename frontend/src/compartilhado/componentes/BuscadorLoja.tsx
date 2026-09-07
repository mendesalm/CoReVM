// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
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

  const getPotenciaNome = (id?: number) => {
    if (!id) return '-';
    if (id === 1) return 'GOB';
    if (id === 2) return 'CMSB';
    if (id === 3) return 'COMAB';
    return String(id);
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
        <div className="bg-[#111] border border-[#333] rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#222] text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3 w-12 text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.length === lojasEncontradas.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? lojasEncontradas.map(l => l.id) : [])}
                    className="accent-[#facc15] w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Loja</th>
                <th className="px-4 py-3">Potência</th>
                <th className="px-4 py-3">Cidade</th>
              </tr>
            </thead>
            <tbody>
              {lojasEncontradas.map(l => (
                <tr key={l.id} className="border-b border-[#333] hover:bg-[#1a1a1a] transition-colors cursor-pointer" onClick={() => toggleSelection(l.id)}>
                  <td className="px-4 py-3 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(l.id)}
                      onChange={() => {}} // Controlled via tr onClick
                      className="accent-[#facc15] w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{l.numero_loja}</td>
                  <td className="px-4 py-3">{l.nome}</td>
                  <td className="px-4 py-3">{getPotenciaNome(l.potencia)}</td>
                  <td className="px-4 py-3">{l.cidade || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="p-3 bg-[#151515] flex justify-end">
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
