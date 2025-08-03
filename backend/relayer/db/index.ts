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
  orderStatuses: {
    orderHash: string,
    isFilling: boolean,
    isFilled: boolean,
    srcClaimTxHash: string,
    dstClaimTxHash: string,
    srcEscrowDeployTxHash: string,
    dstEscrowDeployTxHash: string,
    errorMessage?: string
  }[]
}

const defaultData: Data = { quotes: [], orders: [], addressMappings: [], orderSecrets: [], orderStatuses: [] }

export const db = await JSONFilePreset<Data>('db_data.json', defaultData)

// migration
if (!db.data.orderSecrets) {
  db.data.orderSecrets = []
  await db.write();
}

export async function createOrUpdateOrderStatus(
  orderHash: string,
  updateData: Partial<Data['orderStatuses'][0]>
): Promise<boolean> {
  try {
    const index = db.data.orderStatuses.findIndex(
      status => status.orderHash === orderHash
    );

    if (index === -1) {
      db.data.orderStatuses.push({
        orderHash,
        isFilling: false,
        isFilled: false,
        srcClaimTxHash: '',
        dstClaimTxHash: '',
        srcEscrowDeployTxHash: '',
        dstEscrowDeployTxHash: '',
        ...updateData
      });
    } else {
      db.data.orderStatuses[index] = {
        ...db.data.orderStatuses[index],
        ...updateData,
        orderHash
      };
    }
    await db.write();
    return true;
  } catch (error) {
    console.error('Error creating/updating order status:', error);
    return false;
  }
}
