# Validação — Market Lab 0.2.1

- Compilação TypeScript, Vite, Electron e servidor MCP CJS.
- 38 testes de núcleo/integração: trading LONG/SHORT, margem, liquidação e gaps, reservas, limites, contabilidade, stops/alvos, determinismo, retomada, SQLite e rollback.
- Notícias: texto público sem parâmetros privados, impacto percentual e atraso/duração em relógio simulado, inclusive depois de reiniciar.
- MCP opera a conta principal; acesso a contas de agentes locais continua negado. `open_short` e `get_market_news` são ferramentas públicas; publicação e programação de notícia ficam restritas à interface.
- Teste Electron: compra/limite/cancelamento, risco, agente, backtest, notícia, leitura do texto pelo MCP, compra e SHORT do Claude na conta principal, gráfico e restauração.
- Atualização medida em cenário local com 3.600 candles iniciais e mais 50 ticks: snapshot completo 566.558 bytes; pacote incremental 44.715 bytes, redução de 92,1%. O lote de mercado não gravou durante o intervalo de coalescência, e uma ordem confirmada fez uma gravação imediata. Isso mede esse cenário, não é promessa de FPS em todos os computadores.
- Checkpoints não duplicam candles; o histórico é hidratado do SQLite ao restaurar. Registros SQL inalterados não são regravados. Mercado sem operações é confirmado a cada dois segundos; operações financeiras permanecem duráveis antes da resposta.
- Canvas com altura delimitada evita ciclo de crescimento no ResizeObserver. Séries são atualizadas por barra e pausas não reconstroem o gráfico.

O workflow Windows repete os testes de fonte e do aplicativo empacotado antes de publicar Setup, Portable, ZIP e checksums. O teste Linux usa display Xorg virtual e flags do sandbox somente no launcher de testes.
