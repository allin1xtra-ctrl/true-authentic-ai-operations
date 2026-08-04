import { passwordHash } from "../../../../lib/standalone-auth";
import { postgres } from "../../../../lib/postgres";

export const runtime = "nodejs";

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let different = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1) different |= a[index] ^ b[index];
  return different === 0;
}

export async function POST(request:Request){
  const configured=String(process.env.OWNER_BOOTSTRAP_TOKEN||"");
  const supplied=String(request.headers.get("x-owner-bootstrap-token")||"");
  if(!configured||configured.length<32||supplied.length<32||!await secureEqual(supplied,configured))return Response.json({success:false,error:"Account setup is unavailable or the one-time setup code is invalid."},{status:404});
  const body=await request.json().catch(()=>({})) as {email?:string;password?:string;displayName?:string;organizationName?:string};
  const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),displayName=String(body.displayName||"").trim(),organizationName=String(body.organizationName||"True Authentic Apparel").trim();
  if(!/^\S+@\S+\.\S+$/.test(email)||password.length<14||!displayName)return Response.json({success:false,error:"Valid owner details are required"},{status:400});
  try {
    const sql=postgres();const existing=await sql`SELECT id FROM users LIMIT 1`;if(existing.length)return Response.json({success:false,error:"The owner account has already been created. Sign in instead."},{status:409});
    const organizationId=crypto.randomUUID(),userId=crypto.randomUUID(),now=new Date().toISOString(),hash=await passwordHash(password);
    await sql.transaction(tx=>[tx`INSERT INTO organizations(id,name,slug) VALUES (${organizationId},${organizationName},'true-authentic')`,tx`INSERT INTO users(id,email,display_name,password_hash) VALUES (${userId},${email},${displayName},${hash})`,tx`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES (${organizationId},${userId},'owner')`,tx`INSERT INTO audit_logs(id,organization_id,actor_user_id,action,resource_type,resource_id,outcome,metadata,created_at) VALUES (${crypto.randomUUID()},${organizationId},${userId},'owner.bootstrap','user',${userId},'allowed',${JSON.stringify({source:'one-time-bootstrap'})}::jsonb,${now})`]);
    return Response.json({success:true});
  } catch {
    return Response.json({success:false,error:"Account setup is not ready. Confirm the protected database connection and try again."},{status:503});
  }
}
