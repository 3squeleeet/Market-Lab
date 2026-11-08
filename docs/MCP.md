# Market Lab + Claude: MCP local por STDIO

## Windows — recomendado

1. Instale `Market-Lab-0.2.1-Setup-x64.exe` ou extraia o ZIP completo em uma pasta fixa. No ZIP, o executável é `Market Lab.exe`, ao lado da pasta `resources`.
2. Abra o Market Lab e a página **Conexões MCP**.
3. Copie o JSON completo gerado pelo aplicativo. `command` usa o caminho absoluto real do executável em execução; os argumentos incluem o servidor empacotado, `--discovery` e o arquivo real de descoberta dessa instalação. O bloco `env` ativa o runtime Node já incluído no Electron. Não há caminhos fictícios que você precise adivinhar.
4. Deixe o Market Lab aberto enquanto usa as ferramentas.

A versão portátil autoextraível pode ter `process.execPath` temporário. Para uma configuração permanente use instalador/ZIP e copie novamente o JSON depois de mover ou reinstalar o aplicativo.

## Claude Desktop

Abra **Configurações → Desenvolvedor → Editar configuração**. Mescle o bloco `market-lab` no objeto `mcpServers`, preservando seus outros servidores. Salve e reinicie o Claude Desktop.

O arquivo normalmente se chama `claude_desktop_config.json`; o menu do próprio Claude abre a localização correta para seu sistema. O Market Lab não lê nem modifica esse arquivo automaticamente.

O JSON gerado contém esta estrutura, com valores reais preenchidos pelo aplicativo:

```json
{
  "mcpServers": {
    "market-lab": {
      "command": "CAMINHO_ABSOLUTO_REAL_GERADO_NO_PAINEL",
      "args": [
        "SERVIDOR_CJS_REAL_GERADO_NO_PAINEL",
        "--discovery",
        "ARQUIVO_REAL_GERADO_NO_PAINEL"
      ],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

Os valores em maiúsculas acima são marcadores explicativos, **não uma configuração pronta para colar**. A configuração pronta fica no painel e usa os caminhos reais da máquina. O executável faz o papel de servidor STDIO; não é preciso iniciar outro serviço, instalar Node.js ou abrir uma porta.

## Claude Code

Use `claude mcp add-json market-lab` e, como argumento JSON, o objeto interno `market-lab` copiado do painel (contendo `command`, `args` e `env`). Em PowerShell ou Bash, envolva o JSON com aspas simples; se o caminho contiver apóstrofos, ajuste o escape para seu shell. Consulte a conexão com `claude mcp list`.

Depois peça, por exemplo:

> Consulte o estado da simulação, o preço sintético de BTC/USD e o saldo da minha conta MCP. Compre virtualmente 0,001 BTC usando um requestId único. Consulte a posição e as taxas. Não use dinheiro real.

As ferramentas MCP usam sua conta principal. Compras, vendas e shorts alteram o patrimônio que você vê em Visão geral e Portfólio. Para abrir vendido, use `open_short` com ativo, quantidade e requestId; para cobrir, `close_position`. As execuções aparecem no gráfico do ativo.

## Código-fonte — gerador de configuração com caminhos existentes

```sh
npm ci
npm run build
npm start
```

Copie o caminho **real** de descoberta mostrado no painel e execute:

```sh
npm run mcp:config -- --discovery "COLE_AQUI_O_CAMINHO_REAL_DO_PAINEL"
```

O gerador verifica a existência do arquivo de descoberta e do script compilado e imprime JSON com os caminhos absolutos reais do Node e do servidor. Não imprime a credencial contida no arquivo. O script fonte de lançamento é `packages/mcp-server/src/cli.ts`; sua saída compilada é `dist-electron/packages/mcp-server/src/cli.js`.

Neste repositório de desenvolvimento, o script compilado está em `/workspace/market-lab/dist-electron/packages/mcp-server/src/cli.js`. Esse caminho existe no ambiente de construção; **não use `/workspace` na configuração do seu Windows**. O gerador/painel resolve o caminho do seu checkout ou instalação.

É possível iniciar manualmente o servidor com `npm run mcp -- --discovery "caminho real"`, mas o terminal ficará reservado ao protocolo: mensagens JSON de MCP são trocadas por stdin/stdout. Isso é esperado; não há uma página HTTP para abrir.

## Instância local, autenticação e contas

O aplicativo principal mantém o SQLite e todos os motores. O processo STDIO é somente um cliente dessa instância, via named pipe no Windows ou socket Unix com permissão 0600. O arquivo de descoberta fica em `userData` e contém um token aleatório de 256 bits, renovado em cada abertura. Não compartilhe esse arquivo.

O bridge valida token, schemas, tamanho de requisição, nomes de ferramentas e propriedade das contas. No Unix o arquivo e o socket têm permissão 0600; no Windows a proteção de disco segue as ACLs do perfil do usuário. Processos maliciosos executados pelo mesmo usuário não estão isolados por um cofre de sistema; preserve a segurança da sessão local.

Sem instância aberta, o servidor continua respondendo ao protocolo MCP, mas as ferramentas retornam erro estruturado `UNAVAILABLE`. Não abre outro SQLite, não inicia mercado paralelo nem devolve dados inventados.

O painel mostra disponibilidade local, clientes com heartbeat recente, versão do protocolo, ferramentas e logs. Disponibilidade local não significa Claude conectado. Clientes inativos expiram em 30 segundos.

O MCP usa `main` por padrão e pode operar essa conta principal, conforme solicitado pelo usuário. Contas de agentes locais continuam protegidas; agentes criados por MCP continuam com contas próprias. O MCP não pode alterar saldos, preços, seed, publicar notícias ou consultar sua configuração privada. Contas `external` de versões anteriores são preservadas como histórico; não são fundidas com a principal.

## Ferramentas (35)

| Grupo     | Ferramentas                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Mercado   | get_market_news, get_market_overview, get_asset_price, get_market_candles, get_order_book, get_market_regime, get_market_events |
| Conta     | get_account_balance, get_portfolio, get_open_positions, get_trade_history, get_order_history                                    |
| Trading   | open_short, place_market_order, place_limit_order, cancel_order, close_position, set_stop_loss, set_take_profit                 |
| Agentes   | list_agents, create_agent, pause_agent, resume_agent, get_agent_performance, get_agent_history                                  |
| Simulação | get_simulation_status, pause_simulation, resume_simulation, set_simulation_speed, get_simulation_configuration                  |
| Análises  | get_performance_metrics, get_asset_performance, get_equity_curve, run_backtest, get_backtest_results                            |

`requestId` deve ser único por conta e intenção; repetir uma ordem idêntica não a executa duas vezes. Alterar os dados mantendo o mesmo ID gera conflito. Quantidade mínima: 0,00000001 unidade. Taxas/slippage/spread são em pontos-base (10 bps = 0,1%). Símbolos incluem `/USD`. Datas são segundos Unix do relógio sintético UTC.

Stops/targets aceitam `price` absoluto ou `percent` da entrada, sem os dois simultaneamente. `price: null` remove a proteção. Operações suportam LONG e SHORT com margem virtual 1x. Ordens limitadas reservam capital/inventário e respeitam seu preço limite.

O servidor usa o SDK oficial `@modelcontextprotocol/sdk`. Foram testados negociação/listagem/chamada de ferramentas por STDIO, validação, conta isolada, estado real, reconexão e indisponibilidade; a configuração do Claude do usuário deve ser feita no próprio computador.

## Processo sem janela

A distribuição contém `resources/mcp/server.cjs`, com SDK e dependências empacotados. O JSON usa o próprio `Market Lab.exe` com `ELECTRON_RUN_AS_NODE=1` para executar esse servidor sem janela e sem depender de um Node instalado. O aplicativo gráfico continua como único proprietário dos motores e do banco. Não remova o bloco `env` da configuração.

## Notícias privadas e interpretação

`get_market_news` retorna somente objetos com `text`. O percentual, o ativo impactado, o atraso e a duração não são retornados. O Claude pode consultar preços e candles normalmente e interpretar o efeito observado, mas não publicar notícias nem ler o log administrativo.
