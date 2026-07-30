export async function GET() {
  const gateway = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  return Response.json({
    success: true,
    ai: gateway ? "vercel_ai_gateway" : openai ? "openai_api" : "connection_required",
    configured: gateway || openai,
    checkedAt: new Date().toISOString(),
  });
}
