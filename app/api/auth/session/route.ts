import { currentStandaloneUser } from "../../../../lib/standalone-auth";
export async function GET(){const user=await currentStandaloneUser();return user?Response.json({success:true,user:{email:user.email,displayName:user.displayName,role:user.role}}):Response.json({success:false,error:"Authentication required"},{status:401});}
