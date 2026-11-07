import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./index";
it("preserva uma sessão entre aberturas do arquivo SQLite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "market-lab-"));
  try {
    const file = join(dir, "lab.sqlite");
    const a = await openDatabase(file);
    expect(a.load()).toBeNull();
    const session = {
      version: 1 as const,
      seed: 83,
      ticks: 3801,
      speed: 5,
      volatility: 1.5,
      running: false,
    };
    a.save(session);
    a.close();
    const b = await openDatabase(file);
    expect(b.load()).toEqual(session);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
