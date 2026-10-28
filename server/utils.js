import { createHash, randomBytes } from 'node:crypto';
import { DECIMALS } from './config.js';

export const toAtomic = (usd) => String(Math.round(usd * 10 ** DECIMALS));
export const fromAtomic = (atomic) => Number(atomic) / 10 ** DECIMALS;
export const addressFor = (seed) => '0x' + createHash('sha256').update(seed).digest('hex').slice(0, 40);
export const txHash = () => '0x' + randomBytes(32).toString('hex');
export const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
export const unb64 = (str) => JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
