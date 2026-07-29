# XCMG Report v2.6.21

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

## Melhorias da v2.6.21

- Removidos do menu lateral o texto “Dados salvos neste dispositivo” e a versão antiga.
- Removida da tela de login a exibição da senha inicial.
- Cache e referências atualizados para v2.6.21.
- Ajustes para Android e iPhone: área segura, botões maiores, campos sem zoom automático, modais roláveis e melhor leitura.
- Arquivos `.gitignore`, `README.md` e configuração Vercel revisados.
