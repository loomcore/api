import { Db } from 'mongodb';
import type { Client, Pool } from 'pg';

export type Database = Db | Client | Pool;