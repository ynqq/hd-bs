import chalk from "chalk";
import { exec } from "child_process";
import { version } from "../../package.json";
import { PromptModule } from "inquirer";
import { createOra } from "../ora";

export const sleep = (time: number = 300) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

export const execAsync = <
  R extends string | Buffer = string,
  T extends Parameters<typeof exec> = Parameters<typeof exec>
>(
  commond: T[0],
  msg?: string,
  options?: T[1]
) => {
  return new Promise<R>((resolve, reject) => {
    const ex = exec(commond, options, (error, stdout) => {
      if (error) {
        msg && console.error(chalk.red(msg));
        reject(error);
        ex.kill();
      }
      resolve(stdout as R);
    });
  });
};

export const getGitStatus = async (cwd: string | URL) => {
  const status = await execAsync("git status -s", "", { cwd });
  const lines = status.trim().split("\n");
  return lines.map((line) => {
    const [status, file] = line.trim().split(/\s+(.+)/);
    return { status, file };
  });
};

export const hasconflict = async (cwd: string | URL) => {
  const status = await getGitStatus(cwd);
  return status.some((item) => {
    return item.status.includes("UU");
  });
};

export const checkVersion = async (prompt: PromptModule) => {
  const sp = createOra("正在检查版本");
  let npmVersion = await execAsync("npm view hd-bs version");
  npmVersion = npmVersion.trim().replace(/\n/, "");
  sp.stop();
  if (npmVersion !== version) {
    await prompt({
      type: "confirm",
      name: "update",
      message: `当前版本${version}，最新版本${npmVersion}，是否更新？`,
      default: false,
    }).then(async ({ update }) => {
      if (update) {
        sp.spinner = "monkey";
        sp.text = `正在更新至${npmVersion}`;
        sp.start();
        await execAsync(`npm i hd-bs@latest -g`, "更新中...");
        sp.text = "更新完成";
        sp.spinner = "smiley";
        await sleep(1000);
        sp.stop();
      }
    });
  }
};
