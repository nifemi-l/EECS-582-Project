
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      details?: string;
      location?: string;
    };

    if (!body.title || !body.details) {
      return Response.json(
        { ok: false, error: "Task could not be deleted. Task is not complete!" },
        { status: 400 }
      );
    }

    // TODO: call your server logic here (create user, hash password, etc.)

    return Response.json(
      { ok: true, task: { task: body.title, details: body.details ?? null } },
      { status: 201 }
    );
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
}

