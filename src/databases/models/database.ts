import { Db } from 'mongodb';
import { Client } from 'pg';

export type Database = Db | Client;