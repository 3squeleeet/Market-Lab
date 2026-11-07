> **Windows:** baixe o instalador `.exe` na [página de Releases](https://github.com/3squeleeet/Market-Lab/releases/latest). O botão "Code → Download ZIP" baixa o código-fonte.

# Market Lab 0.1.0

Laboratório desktop de mercado cripto inteiramente sintético. Sem carteiras, corretoras ou dinheiro real. Interface em português.

## Instalar e executar

Use Node.js 24 (recomendado) ou 22 e npm. No Linux, Electron requer bibliotecas gráficas e uma sessão desktop.

```sh
npm ci
npm run dev:desktop
```

Prévia de navegador (usa localStorage em vez de SQLite):

```sh
npm run dev
```

Build de produção e execução desktop:

```sh
npm run build
npm start
```

Validação: `npm test`. `npm run build` verifica TypeScript e gera frontend e processo principal. Para gerar o instalador Windows x64, execute `npm run dist:win`. O arquivo `.exe` fica em `release/`. O instalador é por usuário e permite escolher o diretório de instalação. Não requer Node.js na máquina de destino.

## Implementado

- Electron com isolamento de contexto, renderer sem Node, sandbox, bloqueio de janelas e navegação externa, CSP, preload limitado a carregar/salvar sessão e validação do payload no processo principal.
- Oito seções navegáveis; terminal escuro com patrimônio virtual, posições de demonstração, mercado, spread, volume e gráfico responsivo.
- Oito ativos sintéticos. Retornos lognormais com fator comum, choques individuais, fator persistente e três regimes (lateral, alta, estresse). PRNG com seed e Box–Muller; mesmo seed, volatilidade e número de ticks reproduzem a trajetória.
- Candles por segundo e agregação 1s, 5s, 15s, 30s, 1m, 5m, 15m, 1h; volume, crosshair e seletor de ativo via TradingView Lightweight Charts.
- Relógio independente do tempo real, pausa e velocidades 1x/2x/5x/10x/50x. Datas do mercado são um relógio experimental UTC iniciado em 2025-01-01, não cotações atuais.
- SQLite via sql.js e Drizzle no processo principal. Arquivo `market-lab.sqlite` no diretório userData do Electron, com gravação por arquivo temporário e rename. Perfis, contas, ativos, configurações, sessões e tabela para snapshots. Estado salvo a cada 5 segundos; a trajetória é reconstruída pela seed e contagem de ticks ao reabrir.
- Testes de determinismo, OHLCV, agregação, correlação, pausa/velocidade e persistência SQLite após reabertura.

## Arquitetura

`electron/`: lifecycle, IPC e preload. `src/`: React, Zustand, gráfico e estilos Tailwind/CSS.

| Pacote          | Responsabilidade                                         |
| --------------- | -------------------------------------------------------- |
| core            | Versão e restrição de simulação                          |
| shared          | Tipos de candles, cotações e contrato IPC                |
| market-engine   | PRNG, regimes, preços correlacionados, OHLCV e agregação |
| time-controller | Relógio independente e velocidades                       |
| trading-engine  | Cálculo de P&L e contratos para execução futura          |
| database        | Schemas Drizzle e persistência SQLite                    |
| agent-manager   | Contratos para agentes futuros                           |
| mcp-server      | Contratos para conexões futuras                          |

Os pacotes são workspaces TypeScript internos; Vite os compila a partir da fonte. Nenhum módulo de IA/MCP é apresentado como uma integração ativa.

## Limitações conhecidas

As três posições são exemplos fixos e identificados como demonstração. Não há envio/execução de ordens, histórico de operações reais da simulação, agentes ou servidor MCP ativo. P&L realizado permanece zero. Indicadores de patrimônio usam capital virtual de US$100 mil e marcam essas posições ao preço sintético.

O histórico em memória tem 7.200 candles de 1 segundo por ativo (até duas horas); intervalos longos terão poucas barras. Dados OHLCV intrassegundo são aproximações estocásticas, não um livro de ofertas. A correlação é um fator de risco simplificado, sem calibração empírica. O motor não é um modelo validado para inferência sobre mercados reais.

O motor executa no renderer nesta fundação. A restauração reproduz os ticks de forma síncrona e pode demorar em sessões extensas. O último intervalo de até 5 segundos pode ser perdido ao encerrar abruptamente. Snapshots têm schema preparado, mas ainda não são escritos; o checkpoint salvo contém seed/configuração/ticks. Não há migrações versionadas, compactação de histórico, exportação de pesquisa, autenticação ou assinatura digital do instalador.

## Próximo marco recomendado — 0.2

Implementar execução virtual de ordens a mercado/limite com spread, taxas e ledger transacional; substituir posições demonstrativas por posições persistidas; mover motor para worker/processo dedicado e adicionar checkpoints de PRNG e candles. Depois, expor comandos da simulação por MCP com auditoria e limites de ação.

## Créditos

Gráficos por [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/), Apache 2.0. Consulte os avisos e licenças das dependências antes de distribuir.

## Testes de integração

Com `npm run dev` ativo, execute `npm run test:browser`. Requer Chromium instalado; use `CHROMIUM_PATH` para indicar o executável. A captura fica em `output/market-lab.png`.

Após `npm run build`, execute `npm run test:desktop` em uma sessão gráfica para validar isolamento, IPC, SQLite e reinício. No cloud, foi utilizado um display Xorg virtual e a opção de teste `ELECTRON_TEST_ARGS` para os argumentos exigidos pelo executor. A aplicação mantém sandbox do renderer habilitado por padrão.

Caso o download do Electron precise usar um proxy configurado, em Node 24 use `NODE_USE_ENV_PROXY=1 npx install-electron --no`.
