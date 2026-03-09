/* PROLOGUE
File name: get+api.ts
Description: Route containing behavior for /api/chore/get endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to get a chore
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { get_all_tasks, get_task_by_id, get_tasks_by_feature_id } from "../../../../server/db/db_commands";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id");
    const featureIdParam = url.searchParams.get("feature_id");

    if (idParam) {
      const task = await get_task_by_id(parseInt(idParam));
      return Response.json({ ok: true, task }, { status: 200 });
    } else if (featureIdParam) {
      const tasks = await get_tasks_by_feature_id(parseInt(featureIdParam));
      return Response.json({ ok: true, tasks }, { status: 200 });
    } else {
      const tasks = await get_all_tasks();
      return Response.json({ ok: true, tasks }, { status: 200 });
    }
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to get chore(s)" }, { status: 500 });
  }
}
