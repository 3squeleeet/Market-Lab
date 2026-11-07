import type {
  Account,
  Position,
  Order,
  Quote,
  Symbol,
  TradingState,
  Portfolio,
  ExecutionConfig,
} from "../../shared/src/index.js";
export interface OrderInput {
  requestId: string;
  symbol: Symbol;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** Internal liquidation may close residual inventory below the entry minimum. */
  allowDust?: boolean;
}
export class TradingError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const EPS = 1e-10;
export const DEFAULT_EXECUTION: ExecutionConfig = {
  feeBps: 10,
  slippageBps: 2,
  spreadBps: 1.2,
  limitPriceImprovement: true,
};
export class TradingEngine {
  state: TradingState = {
    accounts: [],
    positions: [],
    closed: [],
    orders: [],
    executions: [],
    sequence: 0,
    config: { ...DEFAULT_EXECUTION },
  };
  constructor(state?: TradingState) {
    if (state) this.state = structuredClone(state);
    else this.addAccount("main", "Conta principal", 100000);
  }
  private id(prefix: string) {
    return `${prefix}-${++this.state.sequence}`;
  }
  addAccount(id: string, name: string, capital: number) {
    if (
      !Number.isFinite(capital) ||
      capital <= 0 ||
      this.state.accounts.some((a) => a.id === id)
    )
      throw new TradingError("ACCOUNT", "Conta ou capital inválido");
    const a: Account = {
      id,
      name,
      initialCapital: capital,
      cash: capital,
      realized: 0,
      deposits: 0,
    };
    this.state.accounts.push(a);
    return a;
  }
  account(id: string) {
    const a = this.state.accounts.find((a) => a.id === id);
    if (!a) throw new TradingError("ACCOUNT", "Conta não encontrada");
    return a;
  }
  position(accountId: string, symbol: Symbol) {
    return this.state.positions.find(
      (p) => p.accountId === accountId && p.symbol === symbol,
    );
  }
  reservedCash(accountId: string, except?: string) {
    return this.state.orders
      .filter(
        (o) =>
          o.accountId === accountId &&
          o.status === "pending" &&
          o.side === "buy" &&
          o.id !== except,
      )
      .reduce(
        (s, o) =>
          s +
          o.quantity *
            o.requestedPrice! *
            (1 + this.state.config.feeBps / 10000),
        0,
      );
  }
  reservedQuantity(accountId: string, symbol: Symbol, except?: string) {
    return this.state.orders
      .filter(
        (o) =>
          o.accountId === accountId &&
          o.symbol === symbol &&
          o.status === "pending" &&
          o.side === "sell" &&
          o.id !== except,
      )
      .reduce((s, o) => s + o.quantity, 0);
  }
  portfolio(accountId: string, quotes: Quote[]): Portfolio {
    const a = this.account(accountId),
      positions = this.state.positions
        .filter((p) => p.accountId === accountId)
        .map((p) => {
          const currentPrice = quotes.find((q) => q.symbol === p.symbol)!.price;
          return {
            ...p,
            currentPrice,
            value: p.quantity * currentPrice,
            unrealized:
              p.quantity * (currentPrice - p.averagePrice) - p.entryFees,
            exposurePercent: 0,
          };
        });
    const invested = positions.reduce((s, p) => s + p.value, 0),
      equity = a.cash + invested,
      reserved = this.reservedCash(accountId);
    for (const p of positions)
      p.exposurePercent = equity > 0 ? (p.value / equity) * 100 : 0;
    return {
      account: { ...a },
      available: Math.max(0, a.cash - reserved),
      reserved,
      equity,
      invested,
      unrealized: positions.reduce((s, p) => s + p.unrealized, 0),
      realized: a.realized,
      returnPercent:
        ((equity - a.initialCapital - a.deposits) / a.initialCapital) * 100,
      positions,
    };
  }
  submit(
    accountId: string,
    input: OrderInput,
    quotes: Quote[],
    time: number,
    maxExposure = 1,
  ): Order {
    const duplicate = this.state.orders.find(
      (o) => o.accountId === accountId && o.requestId === input.requestId,
    );
    if (duplicate) {
      if (
        duplicate.symbol !== input.symbol ||
        duplicate.side !== input.side ||
        duplicate.type !== input.type ||
        duplicate.quantity !== input.quantity ||
        duplicate.requestedPrice !== (input.price ?? null) ||
        duplicate.stopLoss !== (input.stopLoss ?? null) ||
        duplicate.takeProfit !== (input.takeProfit ?? null)
      )
        throw new TradingError(
          "DUPLICATE",
          "Identificador já usado para outra ordem",
        );
      if (duplicate.status === "rejected")
        throw new TradingError(
          "ORDER_REJECTED",
          duplicate.reason ?? "Ordem já rejeitada",
        );
      return duplicate;
    }
    if (
      !Number.isFinite(input.quantity) ||
      input.quantity <= 0 ||
      (!input.allowDust && input.quantity < 1e-8) ||
      input.quantity > 1e12
    )
      throw new TradingError("QUANTITY", "Quantidade inválida");
    const q = quotes.find((q) => q.symbol === input.symbol);
    if (!q) throw new TradingError("ASSET", "Ativo inválido");
    if (
      input.type === "limit" &&
      (!Number.isFinite(input.price) || input.price! <= 0)
    )
      throw new TradingError("PRICE", "Preço limite inválido");
    const order: Order = {
      id: this.id("order"),
      accountId,
      requestId: input.requestId,
      symbol: input.symbol,
      type: input.type,
      side: input.side,
      quantity: input.quantity,
      requestedPrice: input.price ?? null,
      executedPrice: null,
      status: "pending",
      createdAt: time,
      updatedAt: time,
      fees: 0,
      slippage: 0,
      reason: null,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
    };
    const px =
      input.type === "limit" ? input.price! : this.executionPrice(order, q);
    try {
      this.validateRisk(order, px);
      this.validateFunds(order, px, quotes, maxExposure);
    } catch (error) {
      order.status = "rejected";
      order.reason = error instanceof Error ? error.message : "Ordem recusada";
      this.state.orders.push(order);
      throw error;
    }
    this.state.orders.push(order);
    if (input.type === "market" || this.touches(order, q))
      this.fill(order, q, time, quotes, maxExposure);
    return order;
  }
  private validateRisk(o: Order, price: number) {
    if (
      o.stopLoss !== null &&
      (!Number.isFinite(o.stopLoss) || o.stopLoss <= 0 || o.stopLoss >= price)
    )
      throw new TradingError("RISK", "Stop-loss deve ficar abaixo da entrada");
    if (
      o.takeProfit !== null &&
      (!Number.isFinite(o.takeProfit) || o.takeProfit <= price)
    )
      throw new TradingError("RISK", "Take-profit deve ficar acima da entrada");
  }
  private touches(o: Order, q: Quote) {
    return o.side === "buy"
      ? q.ask <= o.requestedPrice!
      : q.bid >= o.requestedPrice!;
  }
  private executionPrice(o: Order, q: Quote) {
    const base = o.side === "buy" ? q.ask : q.bid,
      adjusted =
        base *
        (1 +
          ((o.side === "buy" ? 1 : -1) * this.state.config.slippageBps) /
            10000);
    if (o.type === "market") return adjusted;
    return this.state.config.limitPriceImprovement
      ? o.side === "buy"
        ? Math.min(o.requestedPrice!, adjusted)
        : Math.max(o.requestedPrice!, adjusted)
      : o.requestedPrice!;
  }
  private validateFunds(
    o: Order,
    price: number,
    quotes: Quote[],
    maxExposure: number,
  ) {
    const a = this.account(o.accountId),
      cost = o.quantity * price,
      fee = (cost * this.state.config.feeBps) / 10000;
    if (!Number.isFinite(cost + fee))
      throw new TradingError("VALUE", "Valor inválido");
    if (o.side === "buy") {
      if (cost + fee > a.cash - this.reservedCash(o.accountId, o.id) + EPS)
        throw new TradingError("BALANCE", "Saldo disponível insuficiente");
      const pf = this.portfolio(o.accountId, quotes),
        pending = this.state.orders
          .filter(
            (x) =>
              x.accountId === o.accountId &&
              x.status === "pending" &&
              x.side === "buy" &&
              x.id !== o.id,
          )
          .reduce((s, x) => s + x.quantity * x.requestedPrice!, 0);
      if (
        pf.invested + pending + cost >
        (pf.equity - fee - (pending * this.state.config.feeBps) / 10000) *
          maxExposure +
          EPS
      )
        throw new TradingError("EXPOSURE", "Limite de exposição excedido");
    } else if (
      o.quantity >
      (this.position(o.accountId, o.symbol)?.quantity ?? 0) -
        this.reservedQuantity(o.accountId, o.symbol, o.id)
    )
      throw new TradingError(
        "POSITION",
        "Quantidade disponível na posição insuficiente",
      );
  }
  private fill(
    o: Order,
    q: Quote,
    time: number,
    quotes: Quote[],
    maxExposure: number,
  ) {
    const price = this.executionPrice(o, q);
    this.validateFunds(o, price, quotes, maxExposure);
    const a = this.account(o.accountId),
      notional = price * o.quantity,
      fee = (notional * this.state.config.feeBps) / 10000;
    let p = this.position(o.accountId, o.symbol);
    if (o.side === "buy") {
      a.cash -= notional + fee;
      if (!p) {
        p = {
          id: this.id("position"),
          accountId: o.accountId,
          symbol: o.symbol,
          quantity: 0,
          averagePrice: 0,
          entryFees: 0,
          openedAt: time,
          stopLoss: null,
          takeProfit: null,
        };
        this.state.positions.push(p);
      }
      p.averagePrice =
        (p.averagePrice * p.quantity + notional) / (p.quantity + o.quantity);
      p.quantity += o.quantity;
      p.entryFees += fee;
      if (o.stopLoss !== null) p.stopLoss = o.stopLoss;
      if (o.takeProfit !== null) p.takeProfit = o.takeProfit;
    } else {
      if (!p) throw new TradingError("POSITION", "Posição inexistente");
      const allocation = p.entryFees * (o.quantity / p.quantity),
        pnl = notional - p.averagePrice * o.quantity - fee - allocation;
      a.cash += notional - fee;
      a.realized += pnl;
      this.state.closed.push({
        id: this.id("close"),
        positionId: p.id,
        accountId: p.accountId,
        symbol: p.symbol,
        quantity: o.quantity,
        entryPrice: p.averagePrice,
        exitPrice: price,
        pnl,
        openedAt: p.openedAt,
        closedAt: time,
        reason: o.reason ?? "sell",
      });
      p.quantity = Math.max(0, p.quantity - o.quantity);
      p.entryFees = Math.max(0, p.entryFees - allocation);
      if (p.quantity === 0)
        this.state.positions = this.state.positions.filter((x) => x !== p);
    }
    a.cash = Math.max(0, a.cash);
    o.executedPrice = price;
    o.fees = fee;
    o.slippage =
      Math.abs(price - (o.side === "buy" ? q.ask : q.bid)) * o.quantity;
    o.status = "filled";
    o.updatedAt = time;
    this.state.executions.push({
      id: this.id("fill"),
      orderId: o.id,
      accountId: o.accountId,
      symbol: o.symbol,
      side: o.side,
      quantity: o.quantity,
      price,
      fee,
      slippage: o.slippage,
      time,
    });
    return o;
  }
  cancel(
    accountId: string,
    id: string,
    time: number,
    reason = "Cancelada pelo usuário",
  ) {
    const o = this.state.orders.find(
      (o) => o.id === id && o.accountId === accountId,
    );
    if (!o || o.status !== "pending")
      throw new TradingError("ORDER", "Ordem pendente não encontrada");
    o.status = "cancelled";
    o.reason = reason;
    o.updatedAt = time;
    return o;
  }
  setRisk(
    accountId: string,
    symbol: Symbol,
    kind: "stopLoss" | "takeProfit",
    price: number | null,
    percent: number | undefined,
    quotes: Quote[],
  ) {
    const p = this.position(accountId, symbol);
    if (!p) throw new TradingError("POSITION", "Posição não encontrada");
    const level =
      percent !== undefined
        ? p.averagePrice *
          (1 + ((kind === "stopLoss" ? -1 : 1) * percent) / 100)
        : price;
    if (level !== null && (!Number.isFinite(level) || level! <= 0))
      throw new TradingError("RISK", "Nível de risco inválido");
    const current = quotes.find((q) => q.symbol === symbol)!.price;
    if (
      level !== null &&
      ((kind === "stopLoss" && level! >= current) ||
        (kind === "takeProfit" && level! <= current))
    )
      throw new TradingError(
        "RISK",
        "Stop deve estar abaixo e alvo acima do preço atual",
      );
    p[kind] = level;
    return p;
  }
  close(
    accountId: string,
    symbol: Symbol,
    quotes: Quote[],
    time: number,
    reason = "close",
  ) {
    const p = this.position(accountId, symbol);
    if (!p) throw new TradingError("POSITION", "Posição não encontrada");
    for (const o of this.state.orders.filter(
      (o) =>
        o.accountId === accountId &&
        o.symbol === symbol &&
        o.side === "sell" &&
        o.status === "pending",
    ))
      this.cancel(accountId, o.id, time, "Posição encerrada");
    const o = this.submit(
      accountId,
      {
        requestId: `${reason}-${p.id}-${time}-${this.state.sequence}`,
        symbol,
        side: "sell",
        type: "market",
        quantity: p.quantity,
        allowDust: true,
      },
      quotes,
      time,
    );
    o.reason = reason;
    const closed = this.state.closed.at(-1);
    if (closed) closed.reason = reason;
    return o;
  }
  onTick(
    quotes: Quote[],
    time: number,
    limit: (accountId: string) => number = () => 1,
  ) {
    for (const o of this.state.orders.filter((o) => o.status === "pending")) {
      const q = quotes.find((q) => q.symbol === o.symbol)!;
      if (this.touches(o, q)) {
        try {
          this.fill(o, q, time, quotes, limit(o.accountId));
        } catch (e) {
          o.status = "cancelled";
          o.reason = e instanceof Error ? e.message : "Execução recusada";
          o.updatedAt = time;
        }
      }
    }
    for (const p of [...this.state.positions]) {
      const q = quotes.find((q) => q.symbol === p.symbol)!;
      if (p.stopLoss !== null && q.bid <= p.stopLoss)
        this.close(p.accountId, p.symbol, quotes, time, "stop_loss");
      else if (p.takeProfit !== null && q.bid >= p.takeProfit)
        this.close(p.accountId, p.symbol, quotes, time, "take_profit");
    }
  }
}
// Compatibility helper; includes entry fees when the full engine is used.
export function unrealized(
  positions: { symbol: string; quantity: number; entry: number }[],
  prices: Record<string, number>,
) {
  return positions.reduce(
    (s, p) => s + p.quantity * ((prices[p.symbol] ?? p.entry) - p.entry),
    0,
  );
}
