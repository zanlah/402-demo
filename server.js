// Application entry point: load the directory, register HTTP routes, and start delivery.
import { createApp } from './server/app.js';
import { PORT, BASE, NETWORK } from './server/config.js';
import { initializeDirectory } from './server/directory.js';
import { startDeliveryScheduler } from './server/execution.js';
import { chain, wallet, refreshBalance } from './server/wallet.js';
import { FACILITATOR_URL, FAUCET } from './chain.js';

initializeDirectory();
const server = createApp();
const deliveryTimer = startDeliveryScheduler();
server.on('close', () => clearInterval(deliveryTimer));

server.listen(PORT, async () => {
  console.log(`CyberAgent Marketplace teče na ${BASE}`);
  if (!chain) {
    console.log(`Denarnica glavnega agenta: ${wallet.address} (${wallet.balance} USDC, ${NETWORK}, simulirano)`);
    return;
  }
  await refreshBalance();
  console.log(`Način: Base Sepolia (pravi x402, facilitator ${FACILITATOR_URL})`);
  console.log(`Denarnica glavnega agenta: ${wallet.address}`);
  console.log(`Stanje: ${wallet.balance} USDC  ·  ${wallet.explorer}`);
  if (wallet.balance < 0.2) console.log(`Za plačila potrebuje testne USDC: ${FAUCET} (omrežje Base Sepolia, zgornji naslov).`);
});
