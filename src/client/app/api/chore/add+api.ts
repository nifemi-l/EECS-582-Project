/* PROLOGUE
File name: add+api.ts
Description: Route contining behavior for /api/chore/add endpoint
Programmer: Delroy Wright
Creation date: 2/9/26
Revision date:  3/5/26
Preconditions: A client is running and has requested to add a chore
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { add_task } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      details?: string;
      location?: string;
      frequency_days?: number;
      visibility?: string;
      account_id?: number;
    };

    if (!body.title || !body.location) {
      return Response.json(
        { ok: false, error: "Task could not be added. Missing title or location!" },
        { status: 400 }
      );
    }

    const featureId = parseInt(body.location);
    if (isNaN(featureId)) {
       return Response.json(
        { ok: false, error: "Task could not be added. Invalid location ID!" },
        { status: 400 }
      );
    }

    const taskId = await add_task(
      featureId,
      body.title,
      body.frequency_days ?? 1,
      null,
      body.visibility ?? 'household',
      body.account_id ?? null
    );

    return Response.json(
      { ok: true, task_id: taskId, task: { task: body.title, details: body.details ?? null } },
      { status: 201 }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to add task" }, { status: 500 });
  }
}


