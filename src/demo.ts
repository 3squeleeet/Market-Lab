export const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const price = (n: number) =>
  n < 1
    ? n.toFixed(6)
    : n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export const date = (time: number) =>
  new Date(time * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
