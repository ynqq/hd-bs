import { execAsync } from "../util";
import path from "node:path";
import { createOra } from "../ora";
import chalk from "chalk";
import { getConfig } from "../config";

export interface CreateBranchOptions {
  /** 创建分支
  /** 分支名称 */
  branch: string;
  /** 从哪个分支创建 */
  from: string;
  selectProjectes: string[];
}

export const createBranch = async (config: CreateBranchOptions) => {
  const { branch, from, selectProjectes } = config;
  const { folder, origin } = getConfig();
  for (const item of selectProjectes) {
    const sp = createOra("");
    const cwd = path.join(folder, item);
    sp.text = `正在从${chalk.green(item)}的 ${chalk.red(
      from
    )} 创建 ${chalk.green(branch)} 分支`;
    const allBranches = await execAsync(
      [`git branch --all | grep remotes`],
      "",
      { cwd }
    );
    if (allBranches.includes(`remotes/${origin}/${branch}`)) {
      sp.fail(chalk.red(`${item} ${branch} 远程分支已存在`));
      continue;
    }
    sp.start();
    sp.spinner = "balloon2";
    try {
      await execAsync(
        [
          `git checkout ${from}`,
          `git pull`,
          `git checkout -b ${branch}`,
          `git push -u origin ${branch}`,
        ],
        "",
        { cwd }
      );
    } catch (error) {
      sp.stop();
      sp.fail(`${item} ${branch} 分支创建失败`);
      continue;
    }
    sp.succeed(`${chalk.green(item)} ${chalk.green(branch)} 分支创建成功`);
  }
};

export const mergeBranch = async (config: CreateBranchOptions) => {
  const { branch, from, selectProjectes } = config;
  const { folder, origin } = getConfig();
  for (const item of selectProjectes) {
    const sp = createOra("");
    const cwd = path.join(folder, item);
    sp.text = `正在从${chalk.green(item)}的 ${chalk.red(
      from
    )} 合并到 ${chalk.green(branch)} 分支`;
    const allBranches = await execAsync(
      [`git branch --all | grep remotes`],
      "",
      { cwd }
    );
    if (!allBranches.includes(`remotes/${origin}/${branch}`)) {
      sp.fail(chalk.red(`${item} ${branch} 远程分支不存在`));
      continue;
    }
    if (!allBranches.includes(`remotes/${origin}/${from}`)) {
      sp.fail(chalk.red(`${item} ${from} 远程分支不存在`));
      continue;
    }
    sp.start();
    sp.spinner = "soccerHeader";
    try {
      await execAsync(
        [
          `git checkout ${branch}`,
          `git pull`,
          `git merge ${from}`,
          `git push origin ${branch}`,
        ],
        "",
        { cwd }
      );
    } catch (error) {
      sp.stop();
      sp.fail(`${item} ${branch} 分支合并失败`);
      try {
        execAsync([`git merge --abort`, "code ./"], "", { cwd });
      } catch (error) {}
    }
    sp.succeed(
      `${chalk.green(item)} ${chalk.green(from)} -> ${chalk.green(
        branch
      )} 分支合并成功`
    );
  }
};
