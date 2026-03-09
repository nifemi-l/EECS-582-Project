/* PROLOGUE
File name: get+api.ts
Description: Route containing behavior for /api/feature/get endpoint
Programmer: Delroy Wright
Creation date: 3/8/26
Revision date: 
Preconditions: A client is running and has requested to get a feature
Postconditions: A response is returned to the client.
Errors: Invalid requests may be sent to this endpoint.
Side effects: None
Invariants: None
Known faults: None
*/

import { get_all_features, get_feature_by_id } from "../../../../server/db/db_commands";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id");

    if (idParam) {
      const feature = await get_feature_by_id(parseInt(idParam));
      return Response.json({ ok: true, feature }, { status: 200 });
    } else {
      const features = await get_all_features();
      return Response.json({ ok: true, features }, { status: 200 });
    }
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || "Failed to get feature(s)" }, { status: 500 });
  }
}
