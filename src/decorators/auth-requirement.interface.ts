export type MatchMode = 'all' | 'any';

export interface IAuthRequirement {
    /** The features required to access the resource. */
    features?: string[];
    /** The mode to use when checking the required features. `all` means all features must be present, `any` means any feature must be present. */
    matchMode?: MatchMode;
    /** When true, the user must not be impersonating. */
    denyOnImpersonation?: boolean;
    /** When true, the user must be a member of the meta organization. */
    requireMetaOrg?: boolean;
}
