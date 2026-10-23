// Pravi način x402 na testnem omrežju Base Sepolia.
// Denarnica glavnega agenta podpiše avtorizacijo EIP-3009 (EIP-712), javni facilitator jo preveri
// in poravna na verigi (plin plača facilitator). Denarnica potrebuje le testne USDC.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicClient, erc20Abi, formatUnits, http, verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

export const USDC_ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
export const EXPLORER = 'https://sepolia.basescan.org';
export const FAUCET = 'https://faucet.circle.com';

const WALLET_FILE = fileURLToPath(new URL('./.wallet.json', import.meta.url));

// Ključi se ustvarijo enkrat in shranijo lokalno (.wallet.json), da naslovi ostanejo enaki med zagoni.
function loadKeys(agentIds) {
  const keys = existsSync(WALLET_FILE) ? JSON.parse(readFileSync(WALLET_FILE, 'utf8')) : { agents: {} };
  let changed = false;
  if (!keys.payer) (keys.payer = generatePrivateKey()), (changed = true);
  for (const id of agentIds) if (!keys.agents[id]) (keys.agents[id] = generatePrivateKey()), (changed = true);
  if (changed) writeFileSync(WALLET_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
  return keys;
}

export function createChain(agentIds) {
  const keys = loadKeys(agentIds);
  const payer = privateKeyToAccount(process.env.PAYER_PRIVATE_KEY || keys.payer);
  const agentAddresses = Object.fromEntries(agentIds.map((id) => [id, privateKeyToAccount(keys.agents[id]).address]));
  const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC) });

  async function usdcBalance(address = payer.address) {
    const raw = await client.readContract({ address: USDC_ASSET, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
    return Number(formatUnits(raw, 6));
  }

  function signAuthorization(authorization, extra = { name: 'USDC', version: '2' }) {
    return payer.signTypedData({
      domain: { name: extra.name, version: extra.version, chainId: baseSepolia.id, verifyingContract: USDC_ASSET },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
    });
  }

  // Lastnik denarnice s podpisom sporočila dokaže, da naslov res upravlja (podpis ne stane ničesar).
  const verifyOwner = (address, message, signature) => verifyMessage({ address, message, signature });

  return { payerAddress: payer.address, agentAddresses, usdcBalance, signAuthorization, verifyOwner };
}
