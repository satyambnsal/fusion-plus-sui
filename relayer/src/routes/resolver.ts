import express from 'express';
import { Web3 } from 'web3';
import { ethers } from 'ethers';



const router = express.Router();



router.get('/orders', async (req, res) => {
  try {
    const { address } = req.query;

    // Example using ethers.js
    const balance = await ethersProvider.getBalance(address);

    // Example using web3.js
    const blockNumber = await web3.eth.getBlockNumber();

    res.json({
      message: 'Get resolver orders',
      balance: ethers.formatEther(balance),
      currentBlock: blockNumber
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { orderId, signature } = req.body;

    // Example using ethers.js for transaction
    const tx = {
      to: process.env.RESOLVER_CONTRACT_ADDRESS,
      data: signature,
      value: ethers.parseEther('0')
    };

    // Example using web3.js for gas estimation
    const gasEstimate = await web3.eth.estimateGas(tx);

    res.json({
      message: 'Execute order through resolver',
      gasEstimate: gasEstimate.toString()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router
