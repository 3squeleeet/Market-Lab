# Validação — Market Lab 0.2.0

## Verificações locais

- Compilação TypeScript do renderer e de todos os pacotes/backend, build Vite e Electron.
- 30 testes em cinco arquivos: determinismo e retomada do PRNG, regimes/eventos, OHLCV, correlação, relógio, trading, reservas, taxas/slippage, entrada média, P&L líquido, cancelamentos, limites, SL/TP, idempotência, exposição, propriedade/isolamento, migrations/persistência, restauração, falha de gravação e rollback SQLite.
- O teste MCP usa o SDK oficial via STDIO, lista exatamente as 33 ferramentas e chama as rotas obrigatórias de mercado, conta, ordens, risco, agentes, simulação, análises e backtest. Verifica parâmetros inválidos, conta principal inacessível pelo MCP e `UNAVAILABLE` sem instância aberta.
- Teste Electron com dados reais de um SQLite temporário: navegação das oito páginas, gráfico, compra pela interface, ordem limitada/cancelamento, criação de agente local e execução, backtest, cliente STDIO iniciado pelo executável Electron e restauração de conta/ordens/backtest após fechar e reabrir.
- Verificação do renderer: contextIsolation=true, nodeIntegration=false, sandbox=true e ausência de `window.require`.
- Teste de navegador conecta a interface a um serviço SQLite real por adaptadores apenas do teste; verifica gráfico, navegação, pausa e 50x. Não adiciona servidor HTTP nem simulação alternativa ao produto.

O executor Linux utiliza um display Xorg virtual. Para testes nesse sandbox foram necessários `--no-sandbox --disable-gpu` no launcher do Electron; esses argumentos não são adicionados à aplicação de produção. Os dados, caches e diretórios de teste são separados e não são incluídos nos releases.

## Windows

O workflow `.github/workflows/windows-release.yml` usa Windows, instala dependências, compila, executa os testes unitários/integração e o teste desktop, gera NSIS/portátil/ZIP e repete o teste com `release/win-unpacked/Market Lab.exe`, incluindo MCP via executável. Só depois publica o Release e os checksums SHA-256. A execução correspondente fica disponível na aba Actions do repositório.

A compatibilidade MCP foi exercitada por cliente do SDK oficial. A instalação/configuração do Claude no computador do usuário exige copiar o JSON gerado na página Conexões MCP; não foi realizada remotamente neste ambiente.

## Observações

O teste visual encontrou campos select sem nome acessível exato; eles foram corrigidos com labels explícitos. O início do MCP pelo modo gráfico do Electron não respondeu ao STDIO no Windows. A configuração passou a usar o runtime Node incluído no executável e um servidor CJS externo ao ASAR, sem janela nem Node instalado separadamente. A transferência de estado para o renderer foi reduzida: somente o ativo selecionado recebe histórico longo de candles; os outros recebem candles recentes para minigráficos, enquanto o histórico completo permanece no backend/SQLite.

A distribuição 0.1.0 era somente uma fundação. Consulte README.md e docs/MCP.md para escopo funcional atual e limites de execução spot, liquidez indicativa, amostragem e sessões muito extensas.

O primeiro ciclo Windows detectou um escape incorreto no endereço do named pipe. O formato foi corrigido com String.raw e passou a ter um teste de prefixo Windows executado também no Linux.
