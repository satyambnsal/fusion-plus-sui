import { JSONFilePreset } from 'lowdb/node';
import type { QuoterResponse, SerializedOrder } from '../types';


/** 
 * This is a relayer based trusted setup such that relayer is responsible for listening to order filled events from resolver and then relayer will reveal the secret. 
 * this setup can be moved to frontend as well where wallets can implement functionality to reveal the secret once resolver confirms that both source and destination escrow been deployed
 * 
*/

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


