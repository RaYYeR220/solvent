import type { LiquiditySource, NavSource, PositionSource, PriceSource } from "./types";

export class MockNavSource implements NavSource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getNavPrice(): Promise<bigint> { return this.value; }
}

export class MockPriceSource implements PriceSource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getMarketPrice(): Promise<bigint> { return this.value; }
}

export class MockLiquiditySource implements LiquiditySource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getLiquidityDepth(): Promise<bigint> { return this.value; }
}

export class MockPositionSource implements PositionSource {
  constructor(public value: bigint) {}
  setValue(v: bigint) { this.value = v; }
  async getAssetBalance(): Promise<bigint> { return this.value; }
}
