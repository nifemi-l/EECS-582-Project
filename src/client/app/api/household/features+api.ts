/* PROLOGUE
File name: features+api.ts
Description: Route containing behavior for /api/household/features endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to get features
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { get_household_features } from "../../../../server/db/db_commands";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const householdId = url.searchParams.get("id");

    if (!householdId) {
      return Response.json(
        { ok: false, error: "Household ID is required" },
        { status: 400 }
      );
    }

    const features = await get_household_features(parseInt(householdId));
    return Response.json({ ok: true, features }, { status: 200 });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to get household features" }, { status: 500 });
  }
}
