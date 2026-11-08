Market Lab 0.2.1 — desempenho, notícias e vendas a descoberto

Baixe o **Setup-x64.exe** para instalar, ou o ZIP completo para extrair em uma pasta fixa. O Portable-x64.exe é para uso rápido; prefira instalação/ZIP para MCP duradouro.

- Claude opera na conta principal e no seu patrimônio virtual.
- LONG/SHORT com margem virtual 1x, cobertura, stop, alvo e liquidação; marcadores e linhas de entrada no gráfico.
- Central de notícias: texto público, impacto privado com ativo, percentual, atraso e duração em tempo simulado. Claude lê somente o texto e interpreta o mercado.
- Atualizações incrementais de gráficos e IPC; checkpoints compactos, salvamentos de mercado agrupados e cache SQL. Ordens continuam salvas antes de retornar sucesso.
- Interface mais legível, tipografia maior e central visual de notícias.

Os saldos e posições existentes são preservados. Não é criada uma conta nova para as ordens do Claude; contas antigas não são fundidas automaticamente. O MCP permanece local por STDIO, sem Node.js externo e sem serviço hospedado.

Tudo é simulado. Sem dinheiro real ou corretoras. Shorts não têm alavancagem; perdas por gaps são limitadas à margem virtual por proteção explícita, registrada no histórico. O instalador ainda não tem assinatura digital.
