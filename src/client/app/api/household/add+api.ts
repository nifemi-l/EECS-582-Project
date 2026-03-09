/* PROLOGUE
File name: add+api.ts
Description: Route containing behavior for /api/household/add endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to add a household
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { add_household } from "../../../../server/db/db_commands";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
    };

    if (!body.name) {
      return Response.json(
        { ok: false, error: "Household name is required" },
        { status: 400 }
      );
    }

    const householdId = await add_household(body.name);

    return Response.json(
      { ok: true, household_id: householdId },
      { status: 201 }
    );
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to add household" }, { status: 500 });
  }
}
