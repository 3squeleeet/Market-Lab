# Market Lab 0.2.0

Aplicativo desktop local de **simulação** de trading de criptomoedas, com Electron, React, TypeScript, SQLite/Drizzle e MCP por STDIO. Não conecta corretoras, exchanges, carteiras ou dinheiro real.

## Baixar para Windows

Abra [Releases](https://github.com/3squeleeet/Market-Lab/releases/latest).

- **Market-Lab-0.2.0-Setup-x64.exe**: recomendado para conectar ao Claude; instala em um caminho estável, permite escolher a pasta e cria atalhos.
- **Market-Lab-0.2.0-Windows-x64.zip**: aplicativo completo extraído em uma pasta fixa; abra `Market Lab.exe`. Também serve para MCP sem instalar Node.js.
- **Market-Lab-0.2.0-Portable-x64.exe**: autoextraível para abrir rapidamente. O executável interno pode ficar em uma pasta temporária, portanto prefira o instalador ou ZIP para uma configuração MCP duradoura.

O "Source code / Download ZIP" do GitHub contém somente código-fonte. Nenhuma distribuição exige Node.js do usuário final. Os executáveis ainda não têm assinatura digital.

## O que funciona

- Mercado sintético de BTC/USD, ETH/USD, SOL/USD, BNB/USD, XRP/USD, DOGE/USD, ADA/USD e AVAX/USD.
- Retornos correlacionados, choques individuais, volatilidade persistente, transições de regimes e eventos sintéticos (alta, queda, volatilidade, baixa atividade).
- Seed e checkpoint do PRNG: restauração exata sem reproduzir todos os ticks anteriores. Velocidade não altera a trajetória para o mesmo número de ticks e mesmas intervenções.
- Gráficos TradingView Lightweight Charts com candles, volume, crosshair, seleção de ativo e intervalos de 1s a 1h; SMA/RSI e spread na página Mercados.
- Relógio independente, pausa/retomada, 1x/2x/5x/10x/50x e intervalo de execução configurável.
- Trading spot virtual: compra/venda a mercado e limitada, spread, slippage, taxas, reserva de saldo/quantidade, idempotência por requestId e cancelamento.
- Posições reais da simulação: entrada média ponderada, redução/fechamento, custos, P&L líquido, patrimônio, retorno ajustado a aportes e exposição. A conta principal começa com US$100.000 e **nenhuma posição**.
- Stop-loss e take-profit por preço ou percentual da entrada, com execução e motivo registrados. Disparam no bid observado; gaps e custos podem gerar execução diferente do gatilho.
- Histórico de ordens, execuções, cancelamentos, fechamentos, eventos e alterações.
- Análises: P&L, retorno, vitórias/perdas, drawdown, lucro/prejuízo médios, melhor/pior fechamento, volume, desempenho por ativo e curvas de patrimônio/resultados.
- Backtests isolados de Buy and Hold, SMA 10/30 e RSI 14 (30/70), com capital, taxas, slippage e período próprios. Sinais usam candles anteriores e execução na abertura seguinte; liquidação no final.
- Agentes locais: criar/editar, ativos autorizados, capital próprio, limite de exposição para novas ordens, estratégia, pausar/retomar/encerrar, histórico de decisões, operações e comparação de resultados. Decisões a cada 15 segundos simulados.
- Painel de desenvolvimento separado, com confirmação: saldo, preço, volatilidade, regime, congelamento, eventos, seed, reinício e avanço do relógio. Tudo auditado; nenhuma dessas intervenções é exposta pelo MCP.
- MCP oficial por STDIO com 33 ferramentas, lendo/escrevendo a instância local aberta por named pipe no Windows ou socket Unix autenticado. Nenhuma porta HTTP para MCP.
- SQLite com migrations, checkpoints, candles históricos, contas, ordens, posições, execuções, agentes, backtests e auditoria. Operações financeiras persistem em transação antes de retornar sucesso; erros de gravação revertem o estado em memória.

## Instalar a partir do código

Node.js 24 e npm. Em Linux é necessária uma sessão gráfica para o desktop.

```sh
npm ci
npm run dev:desktop
```

Produção local:

```sh
npm run build
npm start
```

`npm run dev` inicia somente o frontend Vite para desenvolvimento. Ele não cria um mercado independente no navegador. Os motores executam no backend Electron; não há fallback financeiro em localStorage.

Distribuições, em uma máquina Windows:

```sh
npm run dist:win
```

Gera instalador NSIS, portátil e ZIP em `release/`. Para gerar apenas o portátil em Linux ou Windows: `npm run dist:portable`. Compilação completa e publicação também são executadas pelo workflow Windows do repositório.

## Conectar ao Claude

Veja [docs/MCP.md](docs/MCP.md). Instale/extraia o aplicativo em uma pasta fixa, abra **Conexões MCP** e copie o JSON gerado com os caminhos reais dessa instalação. Mantenha o Market Lab aberto. O processo MCP não abre um banco próprio nem inventa resultados quando a instância está indisponível.

Claude usa uma conta `external` isolada, criada na primeira chamada MCP válida; não pode movimentar a conta principal nem agentes cadastrados pela interface. Agentes criados por MCP pertencem ao controlador MCP e têm limites e contas próprios. O usuário pode inspecionar e controlar todas as contas pela interface.

Não há um modelo embutido nem exigência de API key para estratégias locais. A autenticação/assinatura do Claude pertence ao aplicativo Claude do usuário, não ao Market Lab.

## Arquitetura

| Camada/pacote     | Responsabilidade                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `electron/`       | Ciclo de vida, janela segura, IPC, scheduler e inicialização dos serviços                     |
| `src/`            | Renderer React/Zustand, formulários, tabelas e gráficos; recebe snapshots, sem acesso ao Node |
| `shared`          | Contratos, schemas Zod, validação JSON e catálogo de comandos                                 |
| `market-engine`   | PRNG, regimes, eventos, preços/volume e snapshots determinísticos                             |
| `time-controller` | Conversão do tempo de execução em ticks, pausa e multiplicadores                              |
| `trading-engine`  | Reservas, execução spot, contabilidade e proteções                                            |
| `core`            | Serviço central compartilhado por IPC, agentes e MCP; análises e backtesting                  |
| `agent-manager`   | Estratégias e registro de decisões                                                            |
| `database`        | SQLite/sql.js, Drizzle, migrations e escrita transacional/atômica                             |
| `mcp-server`      | SDK oficial STDIO, bridge local autenticado e cliente da instância aberta                     |

A mesma implementação de trading atende interface, estratégias locais e MCP. O renderer não importa os motores para modificar estado. São preservados `contextIsolation`, sandbox do renderer, `nodeIntegration: false`, CSP e validação de origem do IPC.

## Persistência e migração da 0.1

O banco fica no diretório `userData` do Electron; o caminho real aparece em Configurações. Ao abrir pela primeira vez, as migrations preservam as tabelas antigas. Se houver uma sessão 0.1, seus parâmetros/seed/progresso são importados; as antigas posições de demonstração não viram patrimônio real. A conta virtual começa limpa com US$100.000.

Cada comando financeiro confirma o estado completo e as tabelas normalizadas em uma transação SQLite. O arquivo é gravado por temporário, fsync e rename. Ticks são confirmados em lotes do scheduler; encerramento normal salva o estado. Uma queda de energia pode perder o lote ainda em execução, mas não uma resposta de ordem já confirmada.

Reiniciar/alterar seed cria outro experimento e mantém os registros antigos no SQLite. A interface e as ferramentas normais trabalham na sessão atual; ainda não há seletor para reabrir experimentos arquivados.

## Testes

```sh
npm test
npm run build
npm run test:desktop
```

O teste desktop exige sessão gráfica e verifica as oito páginas, mercado/limite/cancelamento, agentes, backtest, isolamento, MCP pelo próprio executável e restauração após reinício. Para testar a distribuição extraída, defina `MARKET_LAB_EXECUTABLE` como o caminho absoluto de `Market Lab.exe`.

Com Vite ativo, `npm run test:browser` usa Chromium (`CHROMIUM_PATH` se necessário) e conecta a interface a um serviço SQLite real isolado por adaptadores exclusivos do teste. Não é um backend HTTP de produção. Capturas ficam em `output/`.

## Limites do modelo

- Spot long-only, sem alavancagem, short, margem ou liquidação por empréstimo. Execuções são integrais, sem preenchimento parcial ou disputa por liquidez.
- O livro retornado por MCP é **indicativo e sintético**, derivado do spread/volume; não representa ordens de exchange. Ordens não alteram a trajetória do mercado.
- SL/TP e ordens limitadas são avaliados nos ticks observados, sem inferir uma sequência intratick pelo high/low. Pode haver gaps.
- Até 7.200 candles por ativo no gráfico em memória; o histórico completo da sessão permanece no SQLite. Consultas MCP limitam a resposta; backtests aceitam de 32 a 199.999 candles.
- Drawdown é acompanhado a cada tick; curvas de patrimônio têm amostragem a cada dez segundos simulados e nas operações. Vitórias/perdas consideram cada fechamento parcial ou total.
- Mudanças manuais fazem parte do experimento: a reprodutibilidade exige mesma seed, configuração e sequência de intervenções. Ticks não são cotações reais nem seguem o horário atual.
- SQLite é exportado por sql.js e os históricos ativos ficam em memória. Sessões muito extensas ou muitos agentes aumentam custo de checkpoint; não há worker separado nem paginação ilimitada das tabelas da interface (mostram registros recentes).
- A conexão foi validada por clientes do SDK oficial e pelo executável; não é possível configurar ou verificar o Claude instalado no computador do usuário a partir deste ambiente.

Gráficos por [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/), Apache 2.0. Projeto sob MIT; veja LICENSE e as licenças das dependências.
