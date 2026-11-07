Market Lab 0.2.0 — Trading simulado + agentes + MCP local

## Download Windows x64

- **Market-Lab-0.2.0-Setup-x64.exe**: recomendado; instalador com caminho estável para Claude/MCP.
- **Market-Lab-0.2.0-Windows-x64.zip**: aplicativo completo para extrair em uma pasta fixa, sem Node.js.
- **Market-Lab-0.2.0-Portable-x64.exe**: autoextraível para uso rápido; prefira instalador/ZIP para MCP permanente.

Abra Conexões MCP e copie a configuração com os caminhos reais da sua instalação. Mantenha o aplicativo aberto. Não há servidor HTTP, VPS, porta pública, API key obrigatória ou serviço remoto em runtime.

## Implementado

Trading spot virtual a mercado/limite, reservas, taxas, slippage, posições dinâmicas, SL/TP, histórico e SQLite transacional com migrations. Análises e backtests isolados (Hold/SMA/RSI), agentes locais com contas/limites próprios, mod menu confirmado/auditado e 33 ferramentas MCP por STDIO usando SDK oficial e bridge local autenticado.

O MCP usa conta externa isolada e não acessa a conta principal nem ferramentas administrativas. Todas as operações são sintéticas; não há carteiras, corretoras ou dinheiro real.

O workflow testa TypeScript, núcleo/integração, interface Electron e MCP pelo próprio executável, incluindo a versão empacotada no Windows, antes de publicar os arquivos. Consulte VALIDACAO.md e docs/MCP.md para detalhes e limites.

Os executáveis ainda não têm assinatura digital; o Windows pode mostrar editor desconhecido. Os arquivos Source code do GitHub são apenas o código-fonte.
