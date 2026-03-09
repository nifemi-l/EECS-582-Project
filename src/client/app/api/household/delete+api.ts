/* PROLOGUE
File name: delete+api.ts
Description: Route containing behavior for /api/household/delete endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to delete a household
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { delete_household } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string | number;
    };

    if (!body.id) {
      return Response.json(
        { ok: false, error: "Household ID is required" },
        { status: 400 }
      );
    }

    const id = typeof body.id === 'string' ? parseInt(body.id) : body.id;
    await delete_household(id);

    return Response.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to delete household" }, { status: 500 });
  }
}
