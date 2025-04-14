export interface IGeoJSON<T> {
	type: string;
	features: IGeoJSONFeature<T>[];
}

export interface IGeoJSONFeature<T> {
	type: string;
	geometry: {
		type: string;
		coordinates: number[];
	};
	properties: T;
}


