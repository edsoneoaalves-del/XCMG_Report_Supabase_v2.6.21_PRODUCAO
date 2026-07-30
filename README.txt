XCMG Report v2.4.1 — Dashboard limpo

XCMG REPORT v2.3.3 — DASHBOARD E MANUTENÇÃO REVISADOS

XCMG REPORT v2.3.1 — MANUTENÇÃO COM SUBSTITUÍDOS

ALTERAÇÕES DA VERSÃO
- Card exclusivo: Renovação do selo (Vale).
- Renovação do selo não é contabilizada como manutenção.
- Manutenção = Preventiva + Corretiva + equipamentos substituídos.
- Contagem sem duplicidade por prefixo.
- Painel exclusivo para Renovação do selo.
- Painel de manutenção exibe os equipamentos substituídos e seus substitutos.
- Dashboard revisado e responsivo.

DADOS
Os dados continuam armazenados no navegador (localStorage), preservando a compatibilidade com versões anteriores.

PUBLICAÇÃO
Envie todos os arquivos desta pasta para a Vercel.


AJUSTE v2.3.1
- Equipamentos informados no campo “Substitui equipamento” entram na manutenção.
- Cada prefixo é contado apenas uma vez na manutenção.
- O equipamento substituto mantém o próprio status operacional.
- Renovação do selo continua fora da manutenção.
- Card e painel exibem a regra de forma mais clara.

CORREÇÃO v2.3.3
- Frota ativa passa a considerar prefixos únicos cadastrados e prefixos informados como substituídos.
- Cards operacionais usam classificação exclusiva por prefixo, evitando sobreposição.
- Prioridade da classificação: Renovação do selo > Manutenção > Em atendimento > Disponível.
- Renovação do selo permanece fora da manutenção.
- Preventiva, corretiva e substituídos são consolidados sem duplicidade.


Versão 2.4.4
- Coluna Cliente adicionada entre Status e Localização.
- Cliente permanece editável na atualização rápida.
- Clientes dedicados preenchidos automaticamente quando o campo estiver vazio.


Versão 2.4.5
- Campo rápido “Substitui” reduzido para liberar espaço na tabela.
- Controle interno manual por equipamento: ⚠️ Pendente / ✅ Conferido.
- Salvar ou editar informações não altera o controle de conferência; somente o clique manual muda entre Pendente e Conferido.
- O controle não aparece nas mensagens e relatórios gerados.


Versão 2.5.0
- Tela de login por usuário.
- Administrador inicial: usuário edson / senha 1234.
- Somente o administrador pode acessar o menu Usuários e criar novos acessos.
- Cadastro com nome, turma, usuário e senha.
- Cada usuário possui equipamentos, relatórios, histórico e configurações separados.
- Ao entrar, o relatório recebe automaticamente o nome e a turma do usuário.
- Senhas armazenadas como hash SHA-256 no navegador.
- Os usuários e dados ficam neste navegador/dispositivo; para sincronização entre aparelhos será necessário banco de dados online.


v2.6.2
- Continuação de turno: ao entrar, opção Continuar relatório anterior.
- Conceito de Assumir Turno.
- Auditoria por usuário.


v2.6.2
- Alteração da própria senha em Configurações.
- Administrador pode redefinir a senha de qualquer usuário.
- Validação da senha atual e confirmação da nova senha.


v2.6.6
- Controle de conferência alterado para uso totalmente manual.
- Novos textos: ⚠️ Pendente e ✅ Conferido.
- Editar ou salvar equipamento não muda automaticamente o controle.
- Continuar relatório anterior preserva o controle exatamente como foi salvo.
- O controle interno continua fora das mensagens geradas.


v2.6.9
- Coluna Ações ampliada.
- Botão Excluir (X) totalmente visível no computador.
- Botões Salvar, Detalhes e Excluir alinhados sem corte.
- Mantida a responsividade para celular e tablet.


v2.6.9
- Coluna Atualização removida da grade principal.
- Texto repetitivo da categoria removido abaixo do prefixo.
- Espaço redistribuído para condição, substituição, controle e ações.
- Data e hora continuam preservadas internamente no histórico e nos detalhes.


v2.6.10
- Removido do Dashboard o texto explicativo sobre o controle Pendente/Conferido, deixando a passagem de turno mais limpa e objetiva.


Versão 2.6.13
- Dashboard compactado em telas desktop largas.
- Passagem de turno, seis indicadores e painel de manutenção cabem na mesma tela.
- Mantida a responsividade para notebook, tablet e celular.


Versão 2.6.13
- Dashboard mais enxuto e claro.
- Indicadores com menor altura e melhor contraste.
- Cards de manutenção menores e com leitura mais objetiva.
- Melhor aproveitamento vertical em notebook e desktop.

Versão 2.6.13
- Adicionado botão "Excluir usuário" na tela Usuários.
- Exclusão disponível somente para o administrador.
- O usuário atualmente conectado não pode ser excluído.
- A exclusão exige confirmação e remove também os dados locais exclusivos do usuário.


Versão 2.6.14
- Bloqueado o cadastro duplicado do mesmo equipamento.
- A validação ignora diferenças entre letras maiúsculas/minúsculas e espaços.
- Ao editar, o próprio equipamento pode ser salvo normalmente, mas não pode assumir um prefixo já cadastrado.

Versão 2.6.15
- A passagem de turno passou a ser salva automaticamente após alterações.
- O salvamento automático mantém os dados disponíveis para o turno seguinte.
- A última atualização é concluída ao sair do sistema ou fechar a página.
- Removido o botão manual “Salvar passagem atual” e incluído o indicador “Salvamento automático”.


Versão 2.6.16
- Removido do Dashboard o painel “Passagem de turno / Continuidade do relatório anterior”.
- Removidos o botão “Continuar relatório anterior”, o indicador visual de salvamento e os dados do usuário anterior.
- A continuidade entre os turnos permanece automática e ocorre em segundo plano.
- Ao entrar com outro usuário, a última situação operacional salva é carregada automaticamente.
- O Dashboard passa a iniciar diretamente pelos indicadores da frota.


Versão 2.6.18
- Dados padrão do relatório separados e persistidos por usuário.
- Campos de turma, supervisor, programação, segurança e rigger permanecem editáveis.
- Alterações nesses campos são salvas automaticamente como padrão do usuário atual.
- A continuidade entre turnos transfere os dados operacionais, sem substituir os dados pessoais do relatório do próximo usuário.


Versão 2.6.19 — Migração para Supabase
- Interface e funcionalidades preservadas.
- Usuários, dados operacionais, relatórios, histórico e passagem de turno sincronizados com o Supabase.
- O localStorage permanece apenas como cache de contingência quando não houver conexão.
- Antes da publicação, execute o arquivo supabase-setup.sql no SQL Editor do projeto Supabase.


Versão 2.6.20 — Correção da conexão Supabase
- Integração atualizada para o SDK oficial supabase-js.
- Removidas chamadas REST manuais.
- Cache do aplicativo atualizado para impedir carregamento da versão anterior.
- Arquivo supabase-setup.sql revisado com permissões e políticas completas.
- Interface e funcionalidades preservadas sem alterações visuais.

Versão 2.6.21 — Revisão para produção e dispositivos móveis
- Removidos do menu lateral “Dados salvos neste dispositivo” e a versão antiga.
- Senha inicial não é mais exibida na tela de login.
- Ajustes de layout para Android e iPhone, incluindo safe area e campos sem zoom automático.
- Cache do PWA atualizado.
- Arquivos de GitHub e Vercel revisados.
