/* PROLOGUE
File name: get+api.ts
Description: Route containing behavior for /api/household/get endpoint
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

import { get_all_households, get_household_by_id } from "../../../../server/db/db_commands";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id");

    if (idParam) {
      const household = await get_household_by_id(parseInt(idParam));
      return Response.json({ ok: true, household }, { status: 200 });
    } else {
      const households = await get_all_households();
      return Response.json({ ok: true, households }, { status: 200 });
    }
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to get household(s)" }, { status: 500 });
  }
}
