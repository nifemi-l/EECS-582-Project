/* PROLOGUE
File name: delete+api.ts
Description: Route contining behavior for /api/chore/delete endpoint
Programmer: Delroy Wright
Creation date: 2/9/26
Revision date: 3/6/26
Preconditions: A client is running and has requested to delete a chore
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { delete_task } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      title?: string;
      details?: string;
      location?: string;
    };

    if (!body.id) {
      return Response.json(
        { ok: false, error: "Task could not be deleted. Missing task ID!" },
        { status: 400 }
      );
    }

    const taskId = parseInt(body.id);
    if (isNaN(taskId)) {
       return Response.json(
        { ok: false, error: "Task could not be deleted. Invalid task ID!" },
        { status: 400 }
      );
    }

    await delete_task(taskId);

    return Response.json(
      { ok: true, message: "Task deleted successfully" },
      { status: 200 }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to delete task" }, { status: 500 });
  }
}


