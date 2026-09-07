// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { Search, Plus } from 'lucide-react';
import ModalCadastroLoja from './ModalCadastroLoja';

const API_URL = 'http://localhost:8003/api/v1';

interface Props {
  onSelect: (loja: { id: number, nome: string, numero: string }) => void;
}

export default function BuscadorLoja({ onSelect }: Props) {
  const [lojaBusca, setLojaBusca] = useState('');
  const [lojasEncontradas, setLojasEncontradas] = useState<any[]>([]);
  const [mostrarCadastroLoja, setMostrarCadastroLoja] = useState(false);

  const handleBuscarLoja = async (termo: string) => {
    setLojaBusca(termo);
    if (termo.length < 3) return;
    try {
      const res = await axios.get(`${API_URL}/integracao/lojas/busca?q=${termo}`);
      setLojasEncontradas(res.data);
      if (res.data.length === 0) {
        setMostrarCadastroLoja(true);
      } else {
        setMostrarCadastroLoja(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    handleBuscarLoja(val);
    
    const sel = lojasEncontradas.find(l => `${l.nome} - ${l.numero_loja}` === val);
    if (sel) {
      onSelect({ id: sel.id, nome: sel.nome, numero: sel.numero_loja });
      setLojaBusca('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-gray-500" />
        </div>
        <input 
          type="text" 
          list="lojas-regiao"
          placeholder="Buscar Loja por Nome ou Número (Mín. 3 caracteres)..." 
          value={lojaBusca}
          onChange={handleChange}
          className="w-full bg-[#080808] border border-[#333] rounded-lg pl-10 p-3 text-white focus:border-[#facc15] focus:outline-none" 
        />
        <datalist id="lojas-regiao">
          {lojasEncontradas.map(l => <option key={l.id} value={`${l.nome} - ${l.numero_loja}`} />)}
        </datalist>
      </div>

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
