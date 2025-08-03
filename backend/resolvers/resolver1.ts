
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3004');

ws.on('open', () => {
  console.log('Connected to relayer WebSocket server');
});

ws.on('message', async (data: any) => {
  const message = JSON.parse(data);
  if (message.event === 'newOrder') {
    const { order, signature, srcChainId, extension, secretHash } = message.data;

    console.log(`Received new order: ${signature}`);

    // // Logic to fill the order
    // try {
    //   // Example: Call the same logic as in /submitOrder to fill the order
    //   console.log('Attempting to fill order...');
    //   // Add your order filling logic here, similar to the /submitOrder endpoint
    // } catch (error) {
    //   console.error(`Failed to fill order ${orderHash}:`, error);
    // }
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from relayer WebSocket server');
});
