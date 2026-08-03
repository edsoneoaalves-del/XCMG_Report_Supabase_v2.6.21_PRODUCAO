# XCMG Report v2.6.23

Sistema web responsivo para gestão operacional, equipamentos, relatórios, histórico e usuários.

## Publicação na Vercel

1. Execute `supabase-setup.sql` no SQL Editor do projeto Supabase.
2. Envie este projeto para um repositório privado no GitHub.
3. Na Vercel, importe o repositório e mantenha o preset como **Other**.
4. Não é necessário comando de build; o diretório de saída é a raiz do projeto.
5. Após a publicação, abra o endereço da Vercel e teste no computador e no celular.

## Primeiro acesso

O projeto preserva o administrador inicial existente no código. Por segurança, altere a senha imediatamente após o primeiro acesso em **Configurações > Alterar minha senha**. A senha inicial não é exibida na tela de login.

## Supabase

A URL e a chave pública do Supabase estão em `js/app.js`. A chave `publishable/anon` pode ficar no navegador, mas as políticas atuais da tabela permitem leitura e escrita anônimas para manter compatibilidade com o aplicativo. Para uso com dados sensíveis ou acesso externo amplo, recomenda-se uma próxima etapa com Supabase Auth e políticas por usuário.

## Melhorias da v2.6.23

- Removidos do menu lateral o texto “Dados salvos neste dispositivo” e a versão antiga.
- Removida da tela de login a exibição da senha inicial.
- Cache e referências atualizados para v2.6.23.
- Ajustes para Android e iPhone: área segura, botões maiores, campos sem zoom automático, modais roláveis e melhor leitura.
- Arquivos `.gitignore`, `README.md` e configuração Vercel revisados.

- Login obrigatório a cada abertura ou atualização da página; a sessão não é mais restaurada automaticamente.


## v2.8.1
- Corrigida a detecção online/offline com verificação real de conectividade.
- Indicador movido para o canto inferior esquerdo.


## v2.8.5 — detecção real de conexão

- O status online/offline agora testa diretamente o endpoint `app_storage` do Supabase.
- Toda a lógica de gravação e sincronização deixou de depender de `navigator.onLine`.
- Verificação automática a cada 5 segundos e verificação manual ao clicar no indicador.
- Falhas de gravação remota mudam o status imediatamente para offline e colocam os dados na fila local.


## Correção 2.8.7 — abertura local e hospedada

- Ao abrir `index.html` diretamente pelo Explorador (`file://`), o navegador não permite Service Worker nem heartbeat HTTP. Nesse modo, o indicador acompanha `navigator.onLine` e os eventos online/offline.
- Em Vercel, localhost ou outro servidor HTTP/HTTPS, o indicador usa o arquivo `connectivity-check.txt` sem cache para validar a conexão real.
- Para validar a PWA e a sincronização completa, teste pela URL da Vercel ou por um servidor local, nunca apenas clicando duas vezes no `index.html`.


## v2.12.46
Cabeçalho da tabela do Status do Efetivo congelado, com rolagem apenas das linhas e altura automática conforme a tela.
