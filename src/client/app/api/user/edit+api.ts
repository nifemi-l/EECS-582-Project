/* PROLOGUE
File name: edit+api.ts
Description: Route containing behavior for /api/user/edit endpoint, proxying to Flask backend.
Programmer: Delroy Wright
Creation date: 3/11/26
Preconditions: A client is running and has requested to edit a user
Postconditions: A response from the Flask server is returned to the client.
*/

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const account_id = body.account_id || body.id;

    if (!account_id) {
        return Response.json({ ok: false, error: "account_id is required" }, { status: 400 });
    }

    const backendData = {
        account_name: body.account_name || body.username || body.name,
        email: body.email
    };

    const response = await fetch(`http://localhost:8000/api/user/${account_id}`, {
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
