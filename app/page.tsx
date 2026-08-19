import OperationsPlatform from "./OperationsPlatform";
import { redirect } from "next/navigation";
import { currentStandaloneUser } from "../lib/standalone-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!await currentStandaloneUser()) redirect("/login?return_to=%2F");
  return <OperationsPlatform />;
}
