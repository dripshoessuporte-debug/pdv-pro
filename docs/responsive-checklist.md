# Checklist de responsividade — Gestor Max

Use as ferramentas de dispositivo do navegador e valide as páginas principais sem alterar dados reais de produção.

## Viewports a testar

- Celular compacto: `390x844`
- Celular grande: `430x932`
- Tablet: `768x1024`
- Desktop: `1366+`

## Checklist global

- [ ] Não há scroll horizontal global no documento.
- [ ] O topo mobile mostra a marca Gestor Max e o botão de menu.
- [ ] O menu mobile abre e fecha pelo botão hambúrguer.
- [ ] O menu mobile fecha ao tocar em um item de navegação.
- [ ] A navegação respeita os itens permitidos pelo RBAC do usuário atual.
- [ ] O botão **Sair** está acessível no menu mobile.
- [ ] O status do sistema aparece no final do menu mobile.
- [ ] Em desktop, a sidebar lateral permanece visível.
- [ ] O conteúdo longo rola normalmente no `main` em celular e tablet.
- [ ] Botões de ação permanecem clicáveis, com altura confortável para toque.
- [ ] Cards e textos ficam legíveis sem esmagar conteúdo.
- [ ] Tabelas grandes usam scroll interno horizontal quando necessário, sem estourar a página.

## Telas críticas

- [ ] Dashboard: cards e métricas empilham bem em mobile.
- [ ] Pedidos: filtros, listagens e ações continuam navegáveis.
- [ ] Detalhe do pedido: resumo, itens, entrega, ações e painel fiscal não estouram largura.
- [ ] Novo pedido: busca, categorias, produtos, resumo e botões ficam acessíveis em `390px`.
- [ ] Cozinha: cards de pedidos e botões de status são fáceis de tocar.
- [ ] Caixa: cards, valores e botões empilham e permanecem legíveis.
- [ ] Pagamento: métodos, resumo e finalização permanecem utilizáveis.
- [ ] Cardápio: listas, formulários e modais não geram scroll horizontal global.
- [ ] Fiscal: checklist/preflight/status quebram em uma coluna no celular.
- [ ] Integração Focus: tokens, certificado, CSC e ações ocupam 100% quando necessário.
- [ ] Grupos fiscais: listagens e formulários mantêm leitura e ação em mobile.
- [ ] Configurações: navegação secundária pode rolar horizontalmente sem esmagar labels.
- [ ] Rotas/Motoboys: cards, mapas/listas e botões ficam acessíveis no celular.
