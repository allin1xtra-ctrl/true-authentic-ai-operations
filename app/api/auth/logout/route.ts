import { revokeSession } from "../../../../lib/standalone-auth";
import { requestOriginAllowed } from "../../../../lib/auth-request";
export async function POST(request:Request){if(!requestOriginAllowed(request))return Response.json({success:false,error:"Request origin is not allowed."},{status:403});await revokeSession();return Response.json({success:true});}
