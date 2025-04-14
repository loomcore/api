import {Request, Response} from 'express';
import {IApiResponse} from '../models/api-response.interface.js';
import {IQueryOptions, Filter} from '../models/query-options.model.js';
import {QueryOptions} from '../models/query-options.model.js';
import {IPagedResult} from '../models/paged-result.interface.js';
import {SortDirection} from '../models/types/index.js';
import {IApiError} from '../models/api-error.interface.js';
import {IModelSpec} from '../models/model-spec.interface.js';
import { TSchema } from '@sinclair/typebox';

export interface IApiResponseOptions<T> {
	messages?: string[];
	errors?: IApiError[];
	data?: T;
}
function apiResponse<T>(
	response: Response, 
	status: number, 
	options: IApiResponseOptions<T> = {},
	modelSpec?: IModelSpec,
	publicSchema?: TSchema
): Response {
	const success = status! >= 200 && status! < 300;
	let apiResponse: IApiResponse<T>;

	// Encode data if modelSpec is provided
	if (modelSpec && options.data) {
		if (Array.isArray(options.data)) {
			// For arrays, encode each item
			options.data = options.data.map(item => modelSpec.encode(item, publicSchema)) as T;
		} 
		// Special handling for paged results (objects with 'entities' property)
		else if (typeof options.data === 'object' && options.data !== null && 'entities' in options.data && Array.isArray((options.data as any).entities)) {
			const pagedResult = options.data as any;
			// Encode just the entities array, not the whole paged result
			pagedResult.entities = pagedResult.entities.map((item: any) => modelSpec.encode(item, publicSchema));
			options.data = pagedResult as T;
		} 
		else {
			// For single entity
			options.data = modelSpec.encode(options.data, publicSchema) as T;
		}
	}

	if (success) {
		apiResponse = {
			success,
			status,
			data: options?.data,
			messages: options?.messages,
			errors: options.errors,
		};
	}
	else {
		apiResponse = {
			success,
			status: status,
			errors: options.errors,
		};
	}

	return response.status(status!).json(apiResponse);
}

function getQueryOptionsFromRequest(request: Request): QueryOptions {
	const queryOptions: IQueryOptions = {
		orderBy: request.query.orderBy as string,
		sortDirection: request.query.sortDirection as SortDirection,
		page: request.query.page ? parseInt(request.query.page as string) : 1,
		pageSize: request.query.pageSize ? parseInt(request.query.pageSize as string) : 100,
		filters: request.query.filters as { [key: string]: Filter } | undefined
	};

	return new QueryOptions(queryOptions);
}

function getPagedResult<T>(entities: T[], totalRows: number, queryOptions: QueryOptions): IPagedResult<T> {
	const pagedResult = {
		entities,
		total: totalRows,
		page: queryOptions.page,
		pageSize: queryOptions.pageSize,
		totalPages: Math.ceil(totalRows / queryOptions.pageSize),
	};
	return pagedResult;
}

export const apiUtils =  {
	apiResponse,
	getQueryOptionsFromRequest,
	getPagedResult,
};

