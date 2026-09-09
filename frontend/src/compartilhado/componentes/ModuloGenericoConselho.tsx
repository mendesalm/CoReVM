import React from 'react';
import { type LucideIcon, ShieldCheck, Info } from 'lucide-react';

interface ModuloGenericoConselhoProps {
  numero: number;
  titulo: string;
  subtitulo: string;
  icone: LucideIcon;
  descricaoRegras: string;
  regrasRbac: {
    superadmin: string;
    diretoria: string;
    lojas: string;
  };
  children?: React.ReactNode;
}

export const ModuloGenericoConselho: React.FC<ModuloGenericoConselhoProps> = ({
  numero,
  titulo,
  subtitulo,
  icone: Icone,
  descricaoRegras,
  regrasRbac,
  children
}) => {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      
      {/* Cabeçalho do Módulo */}
      <div className="bg-[#151515] border border-[#2b2b2b] rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-[#facc15]/10 border border-[#facc15]/20 rounded-2xl text-[#facc15] shadow-inner">
            <Icone className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-[#facc15]/20 text-[#facc15] border border-[#facc15]/30">
                MÓDULO {numero}
              </span>
              <h2 className="text-xl font-bold text-white tracking-wide">{titulo}</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">{subtitulo}</p>
          </div>
        </div>

        {/* Tag de Governança RBAC */}
        <div className="flex items-center gap-2 bg-[#1c1c1c] px-3.5 py-2 rounded-xl border border-[#333] text-xs">
          <ShieldCheck className="w-4 h-4 text-green-400" />
          <span className="text-gray-300">Governança CoReVM Ativa</span>
        </div>
      </div>

      {/* Cartão de Regras e Matriz de Permissões */}
      <div className="bg-[#121212] border border-[#222] rounded-xl p-4 text-xs space-y-3">
        <div className="flex items-center gap-2 text-gray-300 font-semibold">
          <Info className="w-4 h-4 text-[#facc15]" />
          <span>Matriz de Acesso e Regras de Deleção Visual</span>
        </div>
        <p className="text-gray-400 leading-relaxed pl-6">{descricaoRegras}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 pl-6">
          <div className="p-2.5 bg-[#181818] rounded-lg border border-[#282828]">
            <span className="font-bold text-[#facc15] block mb-1">SuperAdmin:</span>
            <span className="text-gray-400">{regrasRbac.superadmin}</span>
          </div>
          <div className="p-2.5 bg-[#181818] rounded-lg border border-[#282828]">
            <span className="font-bold text-blue-400 block mb-1">Mesa Diretora:</span>
            <span className="text-gray-400">{regrasRbac.diretoria}</span>
          </div>
          <div className="p-2.5 bg-[#181818] rounded-lg border border-[#282828]">
            <span className="font-bold text-purple-400 block mb-1">Lojas Jurisdicionadas:</span>
            <span className="text-gray-400">{regrasRbac.lojas}</span>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal ou Placeholder */}
      {children || (
        <div className="bg-[#151515] border border-[#262626] rounded-2xl p-12 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-[#202020] text-gray-500 mx-auto flex items-center justify-center">
            <Icone className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Módulo em Integração com a Base do Conselho</h3>
            <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
              A arquitetura de dados e telas deste módulo está sendo integrada em conformidade com as Regras de Ouro e o fluxo aprovado.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};

export default ModuloGenericoConselho;
