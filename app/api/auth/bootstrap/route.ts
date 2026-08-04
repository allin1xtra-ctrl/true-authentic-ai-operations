import { passwordHash } from "../../../../lib/standalone-auth";
import { postgres } from "../../../../lib/postgres";
import { isEmail, normalizeEmail, safeEqual, verificationCodeHash } from "../../../../lib/account-verification";

export const runtime = "nodejs";

export async function POST(request:Request){
  const body=await request.json().catch(()=>({})) as {email?:string;password?:string;displayName?:string;organizationName?:string;setupCode?:string};
  const email=normalizeEmail(body.email),password=String(body.password||""),displayName=String(body.displayName||"").trim(),organizationName=String(body.organizationName||"True Authentic Apparel").trim(),setupCode=String(body.setupCode||"").trim();
  if(!isEmail(email)||password.length<15||!displayName||!/^\d{9}$/.test(setupCode))return Response.json({success:false,error:"Enter valid account details and the 9-digit verification code."},{status:400});
  try {
    const sql=postgres();const existing=await sql`SELECT id FROM users LIMIT 1`;if(existing.length)return Response.json({success:false,error:"The owner account has already been created. Sign in instead."},{status:409});
    const codes=await sql`SELECT code_hash FROM account_setup_codes WHERE email=${email} AND consumed_at IS NULL AND expires_at>now() AND failed_attempts<5 LIMIT 1`;
    const row=codes[0] as {code_hash?:string}|undefined;
    const expected=verificationCodeHash(email,setupCode);
    if(!row?.code_hash||!safeEqual(expected,String(row.code_hash))){await sql`UPDATE account_setup_codes SET failed_attempts=failed_attempts+1 WHERE email=${email} AND consumed_at IS NULL`;return Response.json({success:false,error:"The verification code is invalid or expired."},{status:400});}
    const consumed=await sql`UPDATE account_setup_codes SET consumed_at=now() WHERE email=${email} AND code_hash=${expected} AND consumed_at IS NULL AND expires_at>now() RETURNING email`;
    if(!consumed.length)return Response.json({success:false,error:"The verification code is invalid or expired."},{status:400});
    const organizationId=crypto.randomUUID(),userId=crypto.randomUUID(),now=new Date().toISOString(),hash=await passwordHash(password);
    await sql.transaction(tx=>[tx`INSERT INTO organizations(id,name,slug) VALUES (${organizationId},${organizationName},'true-authentic')`,tx`INSERT INTO users(id,email,display_name,password_hash) VALUES (${userId},${email},${displayName},${hash})`,tx`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES (${organizationId},${userId},'owner')`,tx`INSERT INTO audit_logs(id,organization_id,actor_user_id,action,resource_type,resource_id,outcome,metadata,created_at) VALUES (${crypto.randomUUID()},${organizationId},${userId},'owner.bootstrap','user',${userId},'allowed',${JSON.stringify({source:'verified-email-code'})}::jsonb,${now})`]);
    return Response.json({success:true});
  } catch {
    return Response.json({success:false,error:"Account setup is not ready. Confirm the protected database connection and try again."},{status:503});
  }
}
