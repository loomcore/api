import { Join } from "./join.operation.js";
import { JoinMany } from "./join-many.operation.js";
import { JoinThrough } from "./join-through.operation.js";

export type Operation = Join | JoinMany | JoinThrough