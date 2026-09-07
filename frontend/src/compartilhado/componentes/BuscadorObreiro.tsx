// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { Search, Plus, CheckCircle2, Loader2 } from 'lucide-react';
import ModalCadastroObreiro from './ModalCadastroObreiro';

const API_URL = 'http://localhost:8003/api/v1';

interface Props {
  cargo: string;
  lojasConselho: {id: number, nome: string}[]; // Lojas que já estão selecionadas na Região
  onSuccess: (cim: string) => void;
}

export default function BuscadorObreiro({ cargo, lojasConselho, onSuccess }: Props) {
  const [cim, setCim] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [nomeEncontrado, setNomeEncontrado] = useState('');
  const [mostrarCadastroObreiro, setMostrarCadastroObreiro] = useState(false);
  const [travar, setTravar] = useState(false);

  const buscarCim = async () => {
    if (cim.length < 3) return;
    setBuscando(true);
    setErro('');
    setMostrarCadastroObreiro(false);
    try {
      // Dummy check. In real app, it would check IdP
      // const res = await axios.get(`${API_URL}/integracao/obreiros/busca/${cim}`);
      throw new Error("Não encontrado"); // Simulando não encontrado para forçar modal
    } catch (err) {
      setErro(`CIM ${cim} não localizado no e-Sigma.`);
      setMostrarCadastroObreiro(true);
    } finally {
      setBuscando(false);
    }
  };

  if (travar) {
    return (
      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-xs text-green-500 uppercase tracking-widest font-bold mb-1">{cargo}</p>
          <p className="text-white font-medium">{nomeEncontrado} <span className="text-gray-400 text-sm ml-2">(CIM: {cim})</span></p>
        </div>
        <CheckCircle2 className="text-green-500 w-6 h-6" />
      </div>
    );
  }

  return (
    <div className="p-5 bg-[#151515] border border-[#333] rounded-xl space-y-4">
      <h3 className="text-[#facc15] font-semibold flex items-center gap-2">
        <Search className="w-4 h-4" /> Buscar {cargo}
      </h3>
      
      <div className="flex gap-3">
        <div className="flex-1">
          <input 
            type="text" 
            placeholder="Digite o CIM no e-Sigma e pressione Enter ou saia do campo..."
            value={cim}
            onChange={e => setCim(e.target.value)}
            onBlur={buscarCim}
            onKeyDown={e => e.key === 'Enter' && buscarCim()}
            className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none"
          />
        </div>
        {buscando && <div className="p-3"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>}
      </div>
      
      {erro && (
        <div className="flex items-center justify-between p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-orange-500 text-sm">{erro}</p>
          <button 
            type="button" 
            onClick={() => setMostrarCadastroObreiro(true)} 
            className="bg-orange-500 text-black px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-400 transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Cadastrar Obreiro
          </button>
        </div>
      )}

      {mostrarCadastroObreiro && (
        <ModalCadastroObreiro 
          cargoPadrao={cargo.replace(' (Opcional)', '')} // Presidente, Vice-Presidente, etc
          lojasDisponiveis={lojasConselho}
          onSuccess={(newCim) => {
            setCim(newCim);
            setNomeEncontrado("Obreiro Cadastrado");
            setTravar(true);
            setMostrarCadastroObreiro(false);
            onSuccess(newCim);
          }}
          onCancel={() => setMostrarCadastroObreiro(false)}
        />
      )}
    </div>
  );
}
