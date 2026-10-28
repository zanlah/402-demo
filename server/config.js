import { fileURLToPath } from 'node:url';
import { TACTICS } from '../scenarios.js';

export const PORT = Number(process.env.PORT) || 4020;
export const BASE = `http://localhost:${PORT}`;
export const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
// simulacija: lokalni facilitator in denarnica v pomnilniku; sepolia: pravi podpisi in poravnava na testnem omrežju
export const REAL = process.env.X402_MODE === 'sepolia';

// ---------------------------------------------------------------------------
// x402 konstante (USDC na Base Sepolia – testno omrežje; denar ni pravi)
// ---------------------------------------------------------------------------
export const NETWORK = 'base-sepolia';
export const USDC_ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const DECIMALS = 6;
export const ALL_TACTICS = Object.keys(TACTICS);
