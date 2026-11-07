# Validação — Market Lab 0.1.0

Verificações executadas em 7 de novembro de 2026, Node.js 24, Linux.

- `npm run build`: passou (TypeScript, Vite e processos Electron).
- `npm test`: 6 testes passaram, em 2 arquivos. Incluem trajetórias determinísticas, OHLCV positivo, agregação e conservação de volume, correlação entre ativos, relógio e persistência após reabertura SQLite.
- `npm run test:browser`: passou em Chromium. Verificou canvas do gráfico, oito páginas, ativo e timeframe, pausa, 50x, salvamento e restauração; nenhum erro JavaScript de página.
- `npm run test:desktop`: passou no Electron 45.2.3 em Xorg virtual. Verificou contextIsolation=true, nodeIntegration=false, sandbox=true nas preferências do renderer, ausência de require no renderer, configuração de seed, pausa/velocidade, IPC SQLite e restauração após fechar/reabrir.

Para executar o Electron dentro do executor cloud restrito, o teste utilizou `--no-sandbox --disable-gpu` e um diretório temporário de dados. Esses argumentos não são adicionados aos comandos normais de desenvolvimento/produção. Em máquinas Linux, configure o suporte de sandbox do Electron conforme o sistema.

A versão inicial do binário Electron falhou ao criar uma janela, inclusive em um exemplo mínimo. A atualização para a versão 45.2.3 resolveu a falha. Um erro de fechamento antecipado do banco também foi corrigido, movendo o encerramento para `will-quit`.

A validação inicial não incluía instaladores. A distribuição Windows foi adicionada posteriormente, conforme a seção abaixo. Não há certificados de assinatura, conexão MCP, agentes nem execução de ordens. Consulte README.md para arquitetura, execução e limites do modelo sintético.

## Distribuição Windows

Configuração NSIS x64 adicionada com electron-builder. `npm run dist:win` gera `release/Market-Lab-0.1.0-Setup-x64.exe`, com Electron incluído, instalação por usuário e escolha de diretório. O instalador ainda não tem assinatura digital. A execução nativa no Windows ainda não foi verificada neste executor Linux.
