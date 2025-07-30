import { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';
import type { QuoterResponse } from '../types';

type Data = {
  quotes: QuoterResponse[]
}

const defaultData: Data = { quotes: [] }

export const db = await JSONFilePreset<Data>('db_data.json', defaultData)


