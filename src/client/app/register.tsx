/* PROLOGUE
File name: register+api.ts
Description: Route contining behavior for /api/auth/register endpoint
Programmer: Delroy Wright
Creation date: 2/19/26
Revision date: 
Preconditions: A client is running and has requested to register
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/


export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!body.email || !body.password) {
      return Response.json(
        { ok: false, error: "email and password required" },
        { status: 400 }
      );
    }

    // call server logic here 

    return Response.json(
      { ok: true, user: { email: body.email, name: body.name ?? null } },
      { status: 201 }
    );
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
}

