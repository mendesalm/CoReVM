import React from 'react';
import { 
  FileText, BarChart3, MessageSquare 
} from 'lucide-react';
import ModuloGenericoConselho from '../../../compartilhado/componentes/ModuloGenericoConselho';


export const PaginaDocumentos: React.FC = () => (
  <ModuloGenericoConselho
    numero={6}
    titulo="Documentos do Conselho"
    subtitulo="Widgets de Convites, Atas do Conselho, Decretos e Regulamentos Internos"
    icone={FileText}
    descricaoRegras="Repositório documental oficial categorizado por tipo documental com controle de visibilidade."
    regrasRbac={{
      superadmin: "Acesso total irrestrito + Hard Delete de arquivos",
      diretoria: "Upload, publicação oficial e Deleção Visual de documentos",
      lojas: "Leitura pública, download e upload/gestão de documentos próprios"
    }}
  />
);

export const PaginaRelatorios: React.FC = () => (
  <ModuloGenericoConselho
    numero={7}
    titulo="Relatórios de Gestão"
    subtitulo="Indicadores consolidados, presenças em sessões conjuntas e métricas maçônicas"
    icone={BarChart3}
    descricaoRegras="Consolidação analítica de dados regionais para subsidiar decisões estratégicas da liderança."
    regrasRbac={{
      superadmin: "Acesso completo a todos os relatórios analíticos",
      diretoria: "Relatórios consolidados de todas as lojas e da região",
      lojas: "Relatórios analíticos restritos aos dados da respectiva loja"
    }}
  />
);

export const PaginaComunicacao: React.FC = () => (
  <ModuloGenericoConselho
    numero={10}
    titulo="Comunicação Interna"
    subtitulo="Canal direto de mensagens oficiais bilaterais entre a Diretoria e as Lojas"
    icone={MessageSquare}
    descricaoRegras="Comunicação corporativa segura e sigilosa para assuntos administrativos e maçônicos."
    regrasRbac={{
      superadmin: "Auditoria e monitoramento de integridade",
      diretoria: "Envio de circulares e mensagens bilaterais para qualquer loja",
      lojas: "Comunicação direta com a Mesa Diretora do Conselho"
    }}
  />
);
