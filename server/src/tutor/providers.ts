export type Provider = "claude" | "chatgpt";

async function loggedIn(command: string[]) {
  if (!Bun.which(command[0]!)) return false;
  try {
    const p = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => p.kill(), 5000);
    try {
      const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      if (command[0] === "claude") return code === 0 && JSON.parse(stdout).loggedIn === true;
      return code === 0 && /logged in using chatgpt/i.test(stdout + stderr);
    } finally { clearTimeout(timer); }
  } catch { return false; }
}

export async function providerStatus() {
  const [claude, chatgpt] = await Promise.all([loggedIn(["claude", "auth", "status"]), loggedIn(["codex", "login", "status"])]);
  const pdfSupport = !!Bun.which("pdftoppm");
  return [
    { id: "claude" as const, label: "Claude", available: claude, hint: claude ? "Connected through Claude Code" : "Install Claude Code and run claude auth login." },
    { id: "chatgpt" as const, label: "ChatGPT", available: chatgpt && pdfSupport, hint: !chatgpt ? "Install OpenAI Codex CLI and run codex login with ChatGPT." : !pdfSupport ? "Install Poppler (pdftoppm) for PDF support." : "Connected through Codex with ChatGPT" },
  ];
}
