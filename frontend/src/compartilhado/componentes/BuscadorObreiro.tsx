// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, CheckCircle2, Search, Plus } from 'lucide-react';

const API_URL = 'http://localhost:8003/api/v1';

interface Props {
  cargo: string;
  lojasConselho?: { id: number, nome: string }[];
  onSuccess: (cim: string) => void;
}

export default function BuscadorObreiro({ cargo, lojasConselho = [], onSuccess }: Props) {
  const [cim, setCim] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [nomeEncontrado, setNomeEncontrado] = useState('');
  const [erro, setErro] = useState('');
  const [travar, setTravar] = useState(false);

  // Validação silenciosa
  const [mostrarVinculoLoja, setMostrarVinculoLoja] = useState(false);
  const [lojaSelecionadaVinculoId, setLojaSelecionadaVinculoId] = useState<number | null>(null);

  // States Cadastro de Obreiro
  const [mostrarCadastroObreiro, setMostrarCadastroObreiro] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [lojaBusca, setLojaBusca] = useState('');
  const [lojasEncontradas, setLojasEncontradas] = useState<any[]>([]);
  const [lojaSelecionadaId, setLojaSelecionadaId] = useState<number | null>(null);

  // States Cadastro de Loja
  const [mostrarCadastroLoja, setMostrarCadastroLoja] = useState(false);
  const [novaLojaNum, setNovaLojaNum] = useState('');
  const [novaLojaNome, setNovaLojaNome] = useState('');
  const [potenciaId, setPotenciaId] = useState('14'); // Default GLEG
  const [obedienciaId, setObedienciaId] = useState('14');

  const buscarCim = async () => {
    if (cim.length < 3) return;
    try {
      setBuscando(true);
      setErro('');
      setNomeEncontrado('');
      setMostrarCadastroObreiro(false);
      setMostrarVinculoLoja(false);
      
      const res = await axios.get(`${API_URL}/integracao/obreiros/${cim}`);
      const dados = res.data;
      
      // Validação silenciosa
      const belongsToCouncil = lojasConselho.some(l => dados.lojas_ids.includes(l.id));
      
      if (!belongsToCouncil && lojasConselho.length > 0) {
        setNomeEncontrado(dados.nome_completo);
        setMostrarVinculoLoja(true);
      } else {
        setNomeEncontrado(dados.nome_completo);
        setTravar(true);
        onSuccess(cim);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setErro('Obreiro não encontrado no e-Sigma.');
        setMostrarCadastroObreiro(true);
      } else {
        setErro('Erro na busca.');
      }
    } finally {
      setBuscando(false);
    }
  };

  const vincularLojaExistente = async () => {
    if (!lojaSelecionadaVinculoId) return;
    try {
      await axios.post(`${API_URL}/integracao/obreiros/${cim}/vincular-loja`, {
        loja_id: lojaSelecionadaVinculoId
      });
      setMostrarVinculoLoja(false);
      setTravar(true);
      onSuccess(cim);
    } catch (err) {
      alert("Erro ao vincular loja.");
    }
  };

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
      setLojaSelecionadaId(res.data.id);
      setLojaBusca(`${res.data.nome} - ${res.data.id}`);
      setMostrarCadastroLoja(false);
    } catch(err) {
      alert("Erro ao cadastrar Loja");
    }
  };

  const cadastrarObreiro = async () => {
    if (!lojaSelecionadaId) {
      alert("Selecione ou cadastre uma Loja antes de salvar o obreiro.");
      return;
    }
    try {
      const res = await axios.post(`${API_URL}/integracao/obreiros`, {
        nome_completo: novoNome,
        email: novoEmail,
        cim,
        loja_id: lojaSelecionadaId
      });
      alert("Obreiro cadastrado com sucesso!");
      setNomeEncontrado(res.data.nome_completo);
      setMostrarCadastroObreiro(false);
      setTravar(true);
      onSuccess(cim);
    } catch (err) {
      alert("Erro ao cadastrar Obreiro");
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
            placeholder="Digite o CIM no e-Sigma..."
            value={cim}
            onChange={e => setCim(e.target.value)}
            onBlur={buscarCim}
            className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none"
          />
        </div>
        {buscando && <div className="p-3"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>}
      </div>
      
      {erro && <p className="text-orange-500 text-sm font-medium">{erro}</p>}
      
      {mostrarVinculoLoja && (
        <div className="border-t border-[#333] pt-4 mt-4 space-y-4">
          <p className="text-orange-400 font-semibold">{nomeEncontrado} encontrado!</p>
          <p className="text-gray-300 text-sm">Este maçom ainda não pertence a nenhuma loja vinculada a este conselho. Deseja vinculá-lo agora?</p>
          <div className="flex gap-2">
            <select 
              value={lojaSelecionadaVinculoId || ''} 
              onChange={e => setLojaSelecionadaVinculoId(parseInt(e.target.value))}
              className="flex-1 bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:outline-none focus:border-[#facc15]"
            >
              <option value="">Selecione a Loja Representada...</option>
              {lojasConselho.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <button 
              type="button" 
              onClick={vincularLojaExistente} 
              className="bg-[#facc15] text-black px-6 rounded-lg font-bold hover:bg-[#eab308] transition-colors"
            >
              Vincular
            </button>
          </div>
        </div>
      )}

      {mostrarCadastroObreiro && (
        <div className="border-t border-[#333] pt-4 mt-4 space-y-4">
          <p className="text-gray-300 text-sm">Preencha para cadastrar este obreiro no sistema raiz:</p>
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Nome Completo" value={novoNome} onChange={e=>setNovoNome(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none" />
            <input type="email" placeholder="E-mail" value={novoEmail} onChange={e=>setNovoEmail(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none" />
            
            <div className="col-span-2 relative">
              <input 
                type="text" 
                list={`lojas-${cargo}`}
                placeholder="Buscar Loja (Nome ou Número)" 
                value={lojaBusca}
                onChange={e => {
                  handleBuscarLoja(e.target.value);
                  const sel = lojasEncontradas.find(l => `${l.nome} - ${l.numero}` === e.target.value);
                  if(sel) setLojaSelecionadaId(sel.id);
                }}
                className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none" 
              />
              <datalist id={`lojas-${cargo}`}>
                {lojasEncontradas.map(l => <option key={l.id} value={`${l.nome} - ${l.numero}`} />)}
              </datalist>
            </div>
          </div>

          {mostrarCadastroLoja && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg space-y-3">
              <p className="text-orange-500 text-sm">Loja não encontrada. Cadastre-a rapidamente:</p>
              <div className="flex gap-2">
                <input type="number" placeholder="Nº" value={novaLojaNum} onChange={e=>setNovaLojaNum(e.target.value)} className="w-24 bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:outline-none focus:border-orange-500" />
                <input type="text" placeholder="Nome da Loja" value={novaLojaNome} onChange={e=>setNovaLojaNome(e.target.value)} className="flex-1 bg-[#080808] border border-[#333] rounded-lg p-2 text-white focus:outline-none focus:border-orange-500" />
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

                <button type="button" onClick={cadastrarNovaLoja} className="bg-orange-500 text-black px-4 rounded-lg font-bold hover:bg-orange-400 transition-colors">Salvar Loja</button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={cadastrarObreiro} className="bg-[#facc15] text-black px-5 py-2 rounded-lg font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Cadastrar Obreiro no e-Sigma
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
