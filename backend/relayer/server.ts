import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import relayerRoutes, { handleOrderFilled } from './routes/relayer';
import quoterRoutes from './routes/quote'
import { db } from './db'
import http from 'http'
import { WebSocketServer } from 'ws';
import { SOCKET_EVENTS } from '../config';
const app = express();
const port = process.env.PORT || 3004;

const server = http.createServer(app);
const wss = new WebSocketServer({ server });


export const resolvers = new Set();

wss.on('connection', (ws) => {
  console.log('Resolver connected');
  resolvers.add(ws);

  ws.on('message', async (data) => {
    const parsedData = JSON.parse(data.toString())
    if (parsedData.event === SOCKET_EVENTS.ORDER_FILLED) {
      handleOrderFilled(parsedData?.data)
    }
  })

  ws.on('close', () => {
    console.log('Resolver disconnected');
    resolvers.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    resolvers.delete(ws);
  });
});




app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const swaggerFile = require('./swagger-output.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.use('/relayer', relayerRoutes);
app.use('/quoter', quoterRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});


app.use((err: Error, _: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}`);
  console.log(`API Documentation available at http://localhost:${port}/api-docs`);
}); 
