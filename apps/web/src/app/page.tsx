import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE } from "@/lib/api";
export default async function Home() {
  redirect((await cookies()).has(COOKIE) ? "/dashboard" : "/login");
}
