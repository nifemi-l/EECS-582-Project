/* PROLOGUE
File name: edit+api.ts
Description: Route contining behavior for /api/chore/edit endpoint
Programmer: Delroy Wright
Creation date: 2/9/26
Revision date: 
Preconditions: A client is running and has requested to edit a chore
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      details?: string;
      location?: string;
    };

    if (!body.title || !body.details) {
      return Response.json(
        { ok: false, error: "Task could not be edited. Task is not complete!" },
        { status: 400 }
      );
    }

    // TODO: call your server logic here (create user, hash password, etc.)
    // const user = await registerUser(body);

    return Response.json(
      { ok: true, task: { task: body.title, details: body.details ?? null } },
      { status: 201 }
    );
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
}

