/* PROLOGUE
File name: tasks+api.ts
Description: Route containing behavior for /api/household/tasks endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to get all tasks
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { get_household_tasks } from "../../../../server/db/db_commands";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const householdId = url.searchParams.get("id");

    if (!householdId) {
      return Response.json(
        { ok: false, error: "Household ID is required" },
        { status: 400 }
      );
    }

    const tasks = await get_household_tasks(parseInt(householdId));
    return Response.json({ ok: true, tasks }, { status: 200 });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to get household tasks" }, { status: 500 });
  }
}
