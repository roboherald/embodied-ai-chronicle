const ALLOWED_ORIGIN = "https://roboherald.github.io";

function corsHeaders(origin) {
  const allow = origin === ALLOWED_ORIGIN || (origin && origin.startsWith("http://localhost")) ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(data, origin, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/counts") {
      const idsParam = url.searchParams.get("ids") || "";
      const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 500);
      if (!ids.length) return json({ counts: {} }, origin);

      const placeholders = ids.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`SELECT id, count FROM likes WHERE id IN (${placeholders})`)
        .bind(...ids)
        .all();

      const counts = {};
      for (const id of ids) counts[id] = 0;
      for (const row of results) counts[row.id] = row.count;
      return json({ counts }, origin);
    }

    if (request.method === "POST" && url.pathname === "/like") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json" }, origin, 400);
      }
      const id = typeof body.id === "string" ? body.id.trim() : "";
      const action = body.action === "down" ? "down" : "up";
      if (!id || id.length > 128) {
        return json({ error: "invalid id" }, origin, 400);
      }

      await env.DB.prepare("INSERT INTO likes (id, count) VALUES (?, 0) ON CONFLICT(id) DO NOTHING").bind(id).run();
      const sql =
        action === "up"
          ? "UPDATE likes SET count = count + 1 WHERE id = ? RETURNING count"
          : "UPDATE likes SET count = MAX(count - 1, 0) WHERE id = ? RETURNING count";
      const row = await env.DB.prepare(sql).bind(id).first();
      return json({ id, count: row ? row.count : 0 }, origin);
    }

    return json({ error: "not found" }, origin, 404);
  },
};
