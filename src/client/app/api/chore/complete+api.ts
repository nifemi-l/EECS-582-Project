/* PROLOGUE
File name: complete+api.ts
Description: Route containing behavior for /api/chore/complete endpoint
Programmer: Delroy Wright
Creation date: 3/5/26
Revision date: 3/8/26 
Preconditions: A client is running and has requested to complete a chore
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { update_task_last_comp_time } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string | number;
    };

    if (!body.id) {
      return Response.json(
        { ok: false, error: "Task ID is required" },
        { status: 400 }
      );
    }

    const taskId = typeof body.id === 'string' ? parseInt(body.id) : body.id;
    await update_task_last_comp_time(taskId);

    return Response.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to complete task" }, { status: 500 });
  }
}
