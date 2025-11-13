import { Db } from 'mongodb';
import { Sql } from 'postgres';

export type Database = Db | Sql;