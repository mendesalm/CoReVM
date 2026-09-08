// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState } from 'react';
import { UserCircle, ShieldCheck } from 'lucide-react';
import BuscadorObreiro from '../../compartilhado/componentes/BuscadorObreiro';

export default function PainelVM() {
  const [activeTab, setActiveTab] = useState<'perfil'|'familia'|'suplentes'>('suplentes');

  return (
    <div className="min-h-screen bg-[#080808] text-gray-200">
      <div className="bg-[#111] border-b border-[#333] sticky top-0 z-50">
        <div className="max-w-4xl mx-auto p-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#facc15] uppercase tracking-widest">Painel do Venerável Mestre</h1>
            <p className="text-sm text-gray-400">Gestão Local - ARLS Luz e Força</p>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-4 flex gap-6">
          <button onClick={() => setActiveTab('perfil')} className={`pb-3 font-semibold border-b-2 transition-colors ${activeTab === 'perfil' ? 'border-[#facc15] text-[#facc15]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            Meu Perfil
          </button>
          <button onClick={() => setActiveTab('familia')} className={`pb-3 font-semibold border-b-2 transition-colors ${activeTab === 'familia' ? 'border-[#facc15] text-[#facc15]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            Família
          </button>
          <button onClick={() => setActiveTab('suplentes')} className={`pb-3 font-semibold border-b-2 transition-colors ${activeTab === 'suplentes' ? 'border-[#facc15] text-[#facc15]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            Suplentes do Conselho
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        
        {activeTab === 'perfil' && (
          <div className="space-y-6">
            <div className="bg-[#151515] p-6 rounded-xl border border-[#333] flex gap-6 items-start">
              <UserCircle className="w-20 h-20 text-gray-600" />
              <div className="space-y-2 flex-1">
                <h2 className="text-2xl font-bold text-white">João da Silva</h2>
                <p className="text-sm text-gray-400">CIM: 123456 • CPF: 123.456.789-00</p>
                
                <div className="pt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500">E-mail</label>
                    <input type="email" defaultValue="joao@email.com" className="w-full bg-[#080808] border border-[#333] rounded p-2 text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Telefone</label>
                    <input type="text" defaultValue="556299999999" className="w-full bg-[#080808] border border-[#333] rounded p-2 text-white" />
                  </div>
                </div>
                <button className="mt-4 bg-[#facc15] text-black px-4 py-2 rounded-lg font-bold">Salvar Perfil</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'suplentes' && (
          <div className="space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex gap-3">
              <ShieldCheck className="text-blue-500 w-6 h-6 flex-shrink-0" />
              <p className="text-sm text-blue-100">
                Como Venerável Mestre, você pode indicar até <strong>2 obreiros</strong> da sua Loja para atuarem como Suplentes no Conselho Regional.
                Eles terão acesso parcial ao sistema para representar a Loja na sua ausência.
              </p>
            </div>
            
            <BuscadorObreiro 
              cargo="Suplente 1"
              lojasConselho={[{id: 1, nome: "ARLS Luz e Força"}]}
              onSuccess={(cim) => console.log("Suplente 1 definido: ", cim)}
            />
            
            <BuscadorObreiro 
              cargo="Suplente 2 (Opcional)"
              lojasConselho={[{id: 1, nome: "ARLS Luz e Força"}]}
              onSuccess={(cim) => console.log("Suplente 2 definido: ", cim)}
            />
          </div>
        )}

      </div>
    </div>
  );
}
