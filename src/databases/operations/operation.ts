import { Join } from "./join.operation.js";
import { JoinMany } from "./join-many.operation.js";
import { JoinThrough } from "./join-through.operation.js";
import { JoinThroughMany } from "./join-through-many.operation.js";

export type Operation = Join | JoinMany | JoinThrough | JoinThroughMany