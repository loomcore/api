import _ from 'lodash';
import { ValueError } from '@sinclair/typebox/errors';
import { IUserContext, IEntity, IQueryOptions, IPagedResult, IModelSpec } from '@loomcore/common/models';

import { IGenericApiService } from './generic-api-service.interface.js';
import { IDatabase } from '../models/database/database.interface.js';
import { Db } from 'mongodb';
import { Operation } from '../models/operations/operations.js';
import { MongoDBDatabase } from '../models/database/database.mongo.js';
import { Database } from '../models/database/database.js';
import { DeleteResult } from '../models/types/deleteResult.js';

export class GenericApiService2<T extends IEntity> implements IGenericApiService<T> {
  protected database: IDatabase;
  protected pluralResourceName: string;
  protected singularResourceName: string;
  protected modelSpec: IModelSpec;

  /**
   * @constructs GenericApiService2<T> where T extends IEntity
   * @param database Either a MongoDb Db or Postgres Sql database 
   * @param pluralResourceName This is camel-cased, plural (e.g. 'weatherAlerts') 
   * @param singularResourceName This is camel-cased, singular (e.g. 'weatherAlert') 
   * @param modelSpec The model spec 
   */
  constructor(
    database: Database,
    pluralResourceName: string,
    singularResourceName: string,
    modelSpec: IModelSpec
  ) {
    this.pluralResourceName = pluralResourceName;
    this.singularResourceName = singularResourceName;
    this.modelSpec = modelSpec;

    if (database instanceof Db) {
      this.database = new MongoDBDatabase(database, pluralResourceName);
    } else {
      throw Error('Sql Database not supported yet');
    }
  }

  async getAll(userContext: IUserContext): Promise<T[]> {
    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    const entities = await this.database.getAll(operations);
    
    // Allow derived classes to transform the result
    return this.transformList(entities);
  }

  /**
   * This is a hook method.
   * It can be overridden by derived classes to provide certain operations before executing the database request.
   * @param userContext The user context for the operation
   * @param operations A list of operations to apply before executing the database request
   * @returns The potentially modified list of operations
   */
  protected prepareQuery(userContext: IUserContext | undefined, operations: Operation[]): Operation[] {
    return operations;
  }

  transformList(list: any[]): T[] {
    if (!list) return [];

    // Map each item through transformSingle instead of using forEach
    return list.map(item => this.database.transformSingle(item, this.modelSpec));
  }

  validate(doc: any, isPartial?: boolean): ValueError[] | null {
    throw new Error('Method not implemented.');
  }
  validateMany(docs: any[], isPartial?: boolean): ValueError[] | null {
    throw new Error('Method not implemented.');
  }
  prepareDataForDb(userContext: IUserContext, entity: T, isCreate?: boolean): Promise<T>;
  prepareDataForDb(userContext: IUserContext, entity: Partial<T>, isCreate?: boolean): Promise<Partial<T>>;
  prepareDataForDb(userContext: IUserContext, entity: T[], isCreate?: boolean): Promise<T[]>;
  prepareDataForDb(userContext: IUserContext, entity: Partial<T>[], isCreate?: boolean): Promise<Partial<T>[]>;
  prepareDataForDb(userContext: unknown, entity: unknown, isCreate?: unknown): Promise<T[]> | Promise<T> | Promise<Partial<T>> | Promise<Partial<T>[]> {
    throw new Error('Method not implemented.');
  }
  prepareDataForBatchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<Partial<T>[]> {
    throw new Error('Method not implemented.');
  }
  get(userContext: IUserContext, queryOptions: IQueryOptions): Promise<IPagedResult<T>> {
    throw new Error('Method not implemented.');
  }
  getById(userContext: IUserContext, id: string): Promise<T> {
    throw new Error('Method not implemented.');
  }
  getCount(userContext: IUserContext): Promise<number> {
    throw new Error('Method not implemented.');
  }
  create(userContext: IUserContext, entity: T | Partial<T>): Promise<T | null> {
    throw new Error('Method not implemented.');
  }
  createMany(userContext: IUserContext, entities: T[]): Promise<T[]> {
    throw new Error('Method not implemented.');
  }
  batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]> {
    throw new Error('Method not implemented.');
  }
  fullUpdateById(userContext: IUserContext, id: string, entity: T): Promise<T> {
    throw new Error('Method not implemented.');
  }
  partialUpdateById(userContext: IUserContext, id: string, entity: Partial<T>): Promise<T> {
    throw new Error('Method not implemented.');
  }
  partialUpdateByIdWithoutBeforeAndAfter(userContext: IUserContext, id: string, entity: T): Promise<T> {
    throw new Error('Method not implemented.');
  }
  update(userContext: IUserContext, queryObject: any, entity: Partial<T>): Promise<T[]> {
    throw new Error('Method not implemented.');
  }
  deleteById(userContext: IUserContext, id: string): Promise<DeleteResult> {
    throw new Error('Method not implemented.');
  }
  deleteMany(userContext: IUserContext, queryObject: any): Promise<DeleteResult> {
    throw new Error('Method not implemented.');
  }
  find(userContext: IUserContext, mongoQueryObject: any, options?: any): Promise<T[]> {
    throw new Error('Method not implemented.');
  }
  findOne(userContext: IUserContext, mongoQueryObject: any, options?: any): Promise<T> {
    throw new Error('Method not implemented.');
  }
}
