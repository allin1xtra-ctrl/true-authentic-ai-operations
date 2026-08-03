import { revokeSession } from "../../../../lib/standalone-auth";
export async function POST(){await revokeSession();return Response.json({success:true});}
