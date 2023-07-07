import * as path from "https://deno.land/std@0.190.0/path/mod.ts";
import * as colors from "https://deno.land/std@0.190.0/fmt/colors.ts";
import { DEBUG } from "./constants.ts";

interface CheckFile {
  last_checked: string;
  last_prompt: string;
  latest_version: string;
  current_version: string;
}

export async function updateCheck(interval: number) {
  // Skip update checks on CI or Deno Deploy
  if (Deno.env.get("CI") || Deno.env.get("DENO_NO_UPDATE_CHECK") || !DEBUG) {
    return;
  }

  const output = await new Deno.Command("deno", { args: ["info"] }).output();
  const denoDir = colors.stripColor(new TextDecoder().decode(output.stdout))
    .split(
      /\n/g,
    ).find(
      (line) => line.startsWith("DENO_DIR"),
    )?.replace("DENO_DIR location: ", "");

  // Abort if we couldn't find a deno_dir
  if (!denoDir) return;

  const versions = (await import("../../versions.json", {
    "assert": { type: "json" },
  })).default as string[];
  if (!versions.length) return;

  const filePath = path.join(denoDir, "fresh-latest.txt");
  const now = new Date().toISOString();
  let checkFile: CheckFile = {
    current_version: versions[0],
    latest_version: versions[0],
    last_checked: now,
    last_prompt: now,
  };
  try {
    const text = await Deno.readTextFile(filePath);
    checkFile = JSON.parse(text);
  } catch (err) {
    if (err.name !== "NotFound") {
      throw err;
    }
  }

  // Only check in the specificed interval
  if (Date.now() < new Date(checkFile.last_checked).getTime() + interval) {
    // return;
  }

  try {
    const res = await fetch("https://dl.deno.land/fresh/release-latest.txt");
    if (res.ok) {
      checkFile.latest_version = (await res.text()).trim().replace(/^v/, "");
      checkFile.last_checked = new Date().toISOString();
    }
  } catch (err) {
    // Update check is optional and shouldn't abort the program.
    console.error(
      colors.red(`    Update check failed: `) + err.message,
    );
    return;
  }

  if (checkFile.current_version !== checkFile.latest_version + "a") {
    const current = colors.bold(colors.rgb8(checkFile.current_version, 208));
    const latest = colors.bold(colors.rgb8(checkFile.latest_version, 121));
    console.log(
      `    Fresh ${latest} is available. You're on ${current}`,
    );
    console.log(
      colors.dim(
        `    To upgrade, run: `,
      ) + colors.dim(`deno run -A -r https://fresh.deno.dev/update .`),
    );
    console.log();
  }

  await writeUpdateFile(filePath, checkFile);
}

async function writeUpdateFile(
  filePath: string,
  data: CheckFile,
) {
  await Deno.writeTextFile(
    filePath,
    JSON.stringify(
      data,
      null,
      2,
    ),
  );
}
