import React, { useState } from 'react';
import axios from 'axios';
import { Search, Plus } from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

interface Props {
  onSelect: (loja: { id: number, nome: string, numero: number }) => void;
}

export default function BuscadorLoja({ onSelect }: Props) {
  const [lojaBusca, setLojaBusca] = useState('');
  const [lojasEncontradas, setLojasEncontradas] = useState<any[]>([]);
  const [mostrarCadastroLoja, setMostrarCadastroLoja] = useState(false);
  
  // States Cadastro de Loja
  const [novaLojaNum, setNovaLojaNum] = useState('');
  const [novaLojaNome, setNovaLojaNome] = useState('');
  const [potenciaId, setPotenciaId] = useState('14'); // Default GLEG
  const [obedienciaId, setObedienciaId] = useState('14');

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

  const cadastrarNovaLoja = async () => {
    try {
      const res = await axios.post(`${API_URL}/integracao/lojas`, {
        numero: parseInt(novaLojaNum),
        nome: novaLojaNome,
        potencia_id: parseInt(potenciaId),
        obediencia_id: parseInt(obedienciaId)
      });
      alert(`Loja ${res.data.nome} cadastrada!`);
      onSelect({ id: res.data.id, nome: res.data.nome, numero: parseInt(novaLojaNum) });
      setLojaBusca('');
      setNovaLojaNome('');
      setNovaLojaNum('');
      setMostrarCadastroLoja(false);
    } catch(err) {
      alert("Erro ao cadastrar Loja");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    handleBuscarLoja(val);
    
    // Check if the user selected one from the datalist
    const sel = lojasEncontradas.find(l => `${l.nome} - ${l.numero}` === val);
    if (sel) {
      onSelect(sel);
      setLojaBusca(''); // Clear to allow searching another
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
          placeholder="Buscar Loja por Nome ou Número..." 
          value={lojaBusca}
          onChange={handleChange}
          className="w-full bg-[#080808] border border-[#333] rounded-lg pl-10 p-3 text-white focus:border-[#facc15] focus:outline-none" 
        />
        <datalist id="lojas-regiao">
          {lojasEncontradas.map(l => <option key={l.id} value={`${l.nome} - ${l.numero}`} />)}
        </datalist>
      </div>

      {mostrarCadastroLoja && (
        <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg space-y-3">
          <p className="text-orange-500 text-sm">Loja não encontrada. Cadastre-a rapidamente na base oficial:</p>
          <div className="flex gap-2">
            <input 
              type="number" 
              placeholder="Nº" 
              value={novaLojaNum} 
              onChange={e=>setNovaLojaNum(e.target.value)} 
              className="w-24 bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:outline-none focus:border-orange-500" 
            />
            <input 
              type="text" 
              placeholder="Nome da Loja" 
              value={novaLojaNome} 
              onChange={e=>setNovaLojaNome(e.target.value)} 
              className="flex-1 bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:outline-none focus:border-orange-500" 
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={potenciaId} 
              onChange={e => {
                const val = e.target.value;
                setPotenciaId(val);
                if (val === '14') setObedienciaId('14'); // GLEG
              }}
              className="flex-1 bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="14">GLEG (Grande Loja)</option>
              <option value="12">GOB (Grande Oriente)</option>
            </select>
            
            {potenciaId === '12' && (
              <select 
                value={obedienciaId} 
                onChange={e => setObedienciaId(e.target.value)}
                className="flex-1 bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:outline-none focus:border-orange-500"
              >
                <option value="12">GOB (Federal)</option>
                <option value="13">GOB-GO (Goiás)</option>
              </select>
            )}

            <button 
              type="button" 
              onClick={cadastrarNovaLoja} 
              className="bg-orange-500 text-black px-4 rounded-lg font-bold hover:bg-orange-400 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Salvar Loja
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
