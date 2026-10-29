import type { Filter } from '@loomcore/common/models';

export interface JoinFilter {
    key: string;
    filter: Filter;
    aliases: string[];
    column: string;
    crossesMany: boolean;
}