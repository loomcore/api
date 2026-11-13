import type { IEntity, IModelSpec, IQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import type { DeleteResult } from '../../databases/models/delete-result.js';
import { IGenericQueryService } from '../generic-query-service/generic-query-service.interface.js';
import type { IRequestContext } from '../request-context.interface.js';

export interface IGenericApiService<T extends IEntity, TContext extends IRequestContext = IRequestContext>
  extends IGenericQueryService<T, TContext>
{
  getModelSpec(): IModelSpec;

  preProcessEntity(
    context: TContext,
    spec: IModelSpec,
    entity: Partial<T>,
    isCreate: boolean,
  ): Promise<Partial<T>>;

  create(context: TContext, entity: Partial<T>): Promise<T | null>;
  createMany(context: TContext, entities: Partial<T>[]): Promise<T[]>;
  batchUpdate(context: TContext, entities: Partial<T>[]): Promise<T[]>;
  fullUpdateById(context: TContext, id: AppIdType, entity: T): Promise<T>;
  partialUpdateById(context: TContext, id: AppIdType, entity: Partial<T>): Promise<T>;
  update(context: TContext, queryObject: IQueryOptions, entity: Partial<T>): Promise<T[]>;
  deleteById(context: TContext, id: AppIdType): Promise<DeleteResult>;
  deleteMany(context: TContext, queryObject: IQueryOptions): Promise<DeleteResult>;
}
