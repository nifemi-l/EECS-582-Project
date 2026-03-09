/* PROLOGUE
File name: edit+api.ts
Description: Route containing behavior for /api/household/edit endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to edit a household
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { update_household } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string | number;
      name?: string;
    };

    if (!body.id || !body.name) {
      return Response.json(
        { ok: false, error: "Household ID and name are required" },
        { status: 400 }
      );
    }

    const id = typeof body.id === 'string' ? parseInt(body.id) : body.id;
    await update_household(id, body.name);

    return Response.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to edit household" }, { status: 500 });
  }
}
