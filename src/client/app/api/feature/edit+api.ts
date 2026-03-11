/* PROLOGUE
File name: edit+api.ts
Description: Route containing behavior for /api/feature/edit endpoint, proxying to Flask backend.
Programmer: Delroy Wright
Creation date: 3/11/26
Preconditions: A client is running and has requested to edit a feature
Postconditions: A response from the Flask server is returned to the client.
*/

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const feature_id = body.feature_id || body.id;

    if (!feature_id) {
        return Response.json({ ok: false, error: "feature_id is required" }, { status: 400 });
    }

    const backendData = {
        feature_name: body.feature_name || body.name,
        feature_type: body.feature_type || body.type,
        x_pos: body.x_pos,
        y_pos: body.y_pos,
        z_pos: body.z_pos
    };

    const response = await fetch(`http://localhost:8000/api/feature/${feature_id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendData)
    });

    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ ok: false, error: "Failed to connect to backend" }, { status: 500 });
  }
}
