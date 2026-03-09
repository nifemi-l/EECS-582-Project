/* PROLOGUE
File name: household.ts
Description: Mock household data and health bar helper functions for the task list
Programmer: Nifemi Lawal
Creation date: 2/6/26
Revision date: 
  - 3/8/26: Use server classes for consistency
Preconditions: None
Postconditions: Exports types, helper functions, and mock data for the household model
Errors: None. Will always render successfully
Side effects: None
Invariants: None
Known faults: None
*/

import Task from "../../../server/task";
import Feature from "../../../server/feature";
import Household from "../../../server/household";

// Re-exporting for compatibility if needed, but better to use imported classes directly
export { Task as Task, Feature, Household };

// Mock household data used until the real API is hooked up
export const MOCK_HOUSEHOLD = Household.createMockHousehold();
