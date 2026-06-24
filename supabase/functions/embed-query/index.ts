// Edge function: embed a short query string via the Lovable AI Gateway and
// return a 1536-dim vector. Used by retrieval (the Cloudflare worker can't reach
// the gateway directly — it has no LOVABLE_API_KEY).
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/embeddings";
const MODEL = "google/gemini-embedding-001";
const DIM = 1536;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") return json({ error: "Thiếu text" }, 400);
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY chưa cấu hình" }, 500);

    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({ model: MODEL, input: text.slice(0, 8000), dimensions: DIM }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `gateway ${resp.status}: ${t.slice(0, 200)}` }, 502);
    }
    const j: any = await resp.json();
    const embedding = j?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== DIM) return json({ error: "Embedding không hợp lệ" }, 502);
    return json({ embedding });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
