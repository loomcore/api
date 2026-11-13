import type { Filter } from '@loomcore/common/models';

/**
 * Named alias for IQueryOptions['filters'].
 * Proposed for promotion to @loomcore/common; defined here until that lands.
 */
export type Filters = { [key: string]: Filter };
