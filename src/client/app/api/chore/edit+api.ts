/* PROLOGUE
File name: edit+api.ts
Description: Route contining behavior for /api/chore/edit endpoint
Programmer: Delroy Wright
Creation date: 2/9/26
Revision date: 3/8/26
Preconditions: A client is running and has requested to edit a chore
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { update_task } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      title?: string;
      details?: string;
      location?: string;
      frequency_days?: number;
      visibility?: string;
      last_completed?: string;
    };

    if (!body.id || !body.title) {
      return Response.json(
        { ok: false, error: "Task could not be edited. Missing task ID or title!" },
        { status: 400 }
      );
    }

    const taskId = parseInt(body.id);
    if (isNaN(taskId)) {
       return Response.json(
        { ok: false, error: "Task could not be edited. Invalid task ID!" },
        { status: 400 }
      );
    }

    await update_task(
      taskId,
      body.title,
      body.frequency_days ?? 1,
      body.visibility ?? 'household',
      body.last_completed ? new Date(body.last_completed) : null
    );

    return Response.json(
      { ok: true, task: { task: body.title, details: body.details ?? null } },
      { status: 200 }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to edit task" }, { status: 500 });
  }
}


