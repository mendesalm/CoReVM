import { 
  MessageSquare 
} from 'lucide-react';
import ModuloGenericoConselho from '../../../compartilhado/componentes/ModuloGenericoConselho';


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
