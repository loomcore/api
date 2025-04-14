import {IApiError} from './api-error.interface.js';

export type IApiResponse<T> = {
	success?: boolean;
	status?: number;
	errors?: IApiError[];
	messages?: string[];
	data?: T | null;
};
