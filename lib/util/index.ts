import chalk from "chalk";
import { exec } from "child_process";
import { version } from "../../package.json";
import { PromptModule } from "inquirer";
import { createOra } from "../ora";
import { existsSync } from "fs";
import { join } from "path";
import { getConfig } from "../config";

export const sleep = (time: number = 300) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

export const execAsync = <
  R extends string | Buffer = string,
  T extends Parameters<typeof exec> = Parameters<typeof exec>
>(
  commond: T[0] | T[0][],
  msg?: string,
  options?: T[1]
) => {
  return new Promise<R>((resolve, reject) => {
    const ex = exec(
      Array.isArray(commond) ? commond.join("&&") : commond,
      options,
      (error, stdout) => {
        if (error) {
          msg && console.error(chalk.red(msg));
          reject(error);
          ex.kill();
        }
        resolve(stdout as R);
      }
    );
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

export const checkProjectDir = async (projects: string[], branch?: string) => {
  const sp = createOra("项目初始化");
  const { folder, gitPrefix } = getConfig();
  for (const item of projects) {
    const projectPath = join(folder, item);
    if (!existsSync(projectPath)) {
      sp.text = `正在克隆${item}`;
      const commands = [`git clone ${gitPrefix}/${item}`];
      await execAsync(commands.join("&&"), "", { cwd: folder });
    }
    if (branch) {
      sp.text = `${item}正在清理更改并切换到${branch}`;
      await execAsync(
        `git checkout -q -- . && git checkout ${branch} && git pull`,
        "",
        {
          cwd: projectPath,
        }
      );
    }
  }
  sp.succeed("项目切换完成");
};
