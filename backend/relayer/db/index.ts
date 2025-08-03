import { JSONFilePreset } from 'lowdb/node';
import type { QuoterResponse, SerializedOrder } from '../types';


type Data = {
  quotes: QuoterResponse[],
  orders: SerializedOrder[],
  addressMappings: {
    suiAddress: string,
    ethProxyAddress: string
  }[],
  orderSecrets: {
    orderHash: string,
    secret: string
  }[]
  filledOrders: {
    orderHash: string,
    srcEscrowDeployTxHash: string,
    dstEscrowDeployTxHash: string
  }[]
}

const defaultData: Data = { quotes: [], orders: [], addressMappings: [], orderSecrets: [], filledOrders: [] }

export const db = await JSONFilePreset<Data>('db_data.json', defaultData)

// migration
if (!db.data.orderSecrets) {
  db.data.orderSecrets = []
  await db.write();
}


