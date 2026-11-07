export const positions = [
  { symbol: "BTC/USD", quantity: 0.35, entry: 65820 },
  { symbol: "ETH/USD", quantity: 4.2, entry: 3380 },
  { symbol: "SOL/USD", quantity: 32, entry: 168.2 },
];
export const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const price = (n: number) =>
  n < 1
    ? n.toFixed(4)
    : n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
