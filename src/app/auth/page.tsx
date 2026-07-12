import Link from "next/link";

import { AuthForm } from "../components/auth-form";

export default function AuthPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f5] p-6 text-[#17211c]">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#526059] hover:text-[#205b43]">← Back to TalkSQL</Link>
        <AuthForm />
      </div>
    </main>
  );
}
