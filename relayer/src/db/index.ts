import { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';
import type { QuoterResponse, SerializedOrder } from '../types';


type Data = {
  quotes: QuoterResponse[],
  orders: SerializedOrder[],
  addressMappings: {
    suiAddress: string,
    ethProxyAddress: string
  }[]
}

const defaultData: Data = { quotes: [], orders: [], addressMappings: [] }

export const db = await JSONFilePreset<Data>('db_data.json', defaultData)


