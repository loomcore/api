import type {
  IEntity,
  IModelSpec,
  IQueryOptions,
  IUserContext,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import type { ValueError } from '@sinclair/typebox/errors';
import type { DeleteResult } from '../../databases/models/delete-result.js';
import { IGenericQueryService } from '../generic-query-service/generic-query-service.interface.js';

export interface IGenericApiService<T extends IEntity> extends IGenericQueryService<T> {
  getModelSpec(): IModelSpec;
  validate(doc: any, isPartial?: boolean): ValueError[] | null;
  validateMany(docs: any[], isPartial?: boolean): ValueError[] | null;

  preProcessEntity(
    userContext: IUserContext,
    entity: Partial<T>,
    isCreate: boolean,
    allowId: boolean,
  ): Promise<Partial<T>>;

  create(userContext: IUserContext, entity: Partial<T>): Promise<T | null>;
  createMany(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]>;
  batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]>;
  fullUpdateById(
    userContext: IUserContext,
    id: AppIdType,
    entity: T,
  ): Promise<T>;
  partialUpdateById(
    userContext: IUserContext,
    id: AppIdType,
    entity: Partial<T>,
  ): Promise<T>;
  partialUpdateByIdWithoutPreAndPostProcessing(
    userContext: IUserContext,
    id: AppIdType,
    entity: T,
  ): Promise<T>;
  update(
    userContext: IUserContext,
    queryObject: IQueryOptions,
    entity: Partial<T>,
  ): Promise<T[]>;
  deleteById(userContext: IUserContext, id: AppIdType): Promise<DeleteResult>;
  deleteMany(
    userContext: IUserContext,
    queryObject: IQueryOptions,
  ): Promise<DeleteResult>;
}
