import { spawn } from "node:child_process";

const separator = process.argv.indexOf("--");
const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
if (!command.length) {
  throw new Error("Usage: node scripts/retry-transient-cloudflare-command.mjs -- <command> [args...]");
}

const maxAttempts = 4;
const delaysMs = [10_000, 25_000, 45_000];
const transientCloudflareFailure =
  /(?:\b50[234]\b|service unavailable|upstream connect error|disconnect\/reset before headers|connection termination|received a malformed response from the api)/i;

function run() {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    const forward = (stream, target) => {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        output = `${output}${text}`.slice(-100_000);
        target.write(chunk);
      });
    };
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({ code: code ?? 1, signal, output }),
    );
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = await run();
  if (result.code === 0) process.exit(0);
  const retryable = transientCloudflareFailure.test(result.output);
  if (!retryable || attempt === maxAttempts) {
    process.exit(result.code);
  }
  const delay = delaysMs[attempt - 1];
  console.error(
    `Transient Cloudflare deployment failure detected (attempt ${attempt}/${maxAttempts}). Retrying in ${delay / 1_000}s.`,
  );
  await new Promise((resolve) => setTimeout(resolve, delay));
}
