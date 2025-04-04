import path from "path";
import { getConfig } from "../config";
import { execAsync, hasconflict, sleep } from "../util";
import chalk from "chalk";
import * as inquirer from "inquirer";
const { createPromptModule } = inquirer.default;
import { kill } from "process";
import { createOra } from "../ora";
import { Ora } from "ora";
import fs from "node:fs";

const prompt = createPromptModule();
const masterName = "master";

const createTag = async (
  project: string,
  tagName: string,
  branch: string,
  sp: Ora,
  folderPath: string
) => {
  const { origin } = getConfig();
  await execAsync([`git pull`].join("&&"), "", { cwd: folderPath });
  const commamds = [`git tag -l "${tagName}"`];
  const existTag = (
    await execAsync(commamds.join("&&"), "", { cwd: folderPath })
  ).trim();
  if (existTag) {
    sp.stop();
    console.log(chalk.red(`${project}标签${tagName}已存在`));
    const { existAction } = await prompt({
      type: "list",
      name: "existAction",
      message: `${project}标签${tagName}已存在，请选择下一步操作。`,
      choices: [
        { name: "删除并重新创建", value: "delete" },
        { name: "跳过此项目", value: "pass" },
        { name: "终止操作", value: "stop" },
      ],
    });
    if (existAction === "stop") {
      kill(process.pid);
      return;
    }
    if (existAction === "delete") {
      sp.stop();
      const { remoteTagIsDelete } = await prompt({
        type: "confirm",
        message: `${project}远程的${tagName}是否已经删除？`,
        name: "remoteTagIsDelete",
      });
      if (!remoteTagIsDelete) {
        console.log(chalk.red(`请先删除${project}远程的${tagName}标签`));
        kill(process.pid);
      }
      const deleteTagCommands = [`git tag -d ${tagName}`];
      await execAsync(deleteTagCommands.join("&&"), "", { cwd: folderPath });
    } else if (existAction === "pass") {
      return;
    }
  }
  // 创建
  sp.text = `正在创建${project}的标签: ${tagName}`;
  sp.start();
  if (branch === "hotfix") {
    // hotfix 根据 hotfix创建分支 其他的根据master
    const createCommands = [
      `git checkout ${branch}`,
      `git pull`,
      `git tag ${tagName}`,
      `git push ${origin} ${tagName}`,
      `git checkout ${masterName}`,
      `git pull`,
      `git merge ${origin}/${branch}`,
    ];
    await execAsync(createCommands.join("&&"), "", { cwd: folderPath });
    const conflict = await hasconflict(folderPath);
    if (conflict) {
      sp.stop();
      console.log(
        chalk.red(
          `${project}:${branch}->${masterName}合并存在冲突，请联系开发进行处理`
        )
      );
      try {
        execAsync(`code ${folderPath}`);
      } catch (error) {}
      kill(process.pid);
      return;
    }
    await execAsync([`git push ${origin} ${masterName}`].join("&&"), "", {
      cwd: folderPath,
    });
  } else {
    const createCommands = [
      `git pull`,
      `git checkout ${masterName}`,
      `git pull`,
      `git merge ${origin}/${branch}`,
    ];
    await execAsync(createCommands.join("&&"), "", { cwd: folderPath });
    const conflict = await hasconflict(folderPath);
    if (conflict) {
      sp.stop();
      try {
        execAsync(`code ${folderPath}`);
      } catch (error) {}
      console.log(
        chalk.red(
          `${project}:${branch}->${masterName}合并存在冲突，请联系开发进行处理`
        )
      );
      kill(process.pid);
      return;
    }
    await execAsync(
      [
        `git push ${origin} ${masterName}`,
        `git tag ${tagName}`,
        `git push ${origin} ${tagName}`,
      ].join("&&"),
      "",
      { cwd: folderPath }
    );
  }
  try {
    // master -> dev允许失败
    const mergeMasterToDevCommands = [
      `git checkout dev`,
      `git pull`,
      `git merge ${origin}/${masterName}`,
      `git push ${origin} dev`,
    ];
    await execAsync(mergeMasterToDevCommands.join("&&"), "", {
      cwd: folderPath,
    });
  } catch (error) {
    console.log(
      chalk.red(`${project}${masterName}->dev合并失败，请联系开发进行处理`)
    );
  }
  sp.text = `${project}标签创建完成`;
  await sleep(500);
};

export const createTags = async ({
  tagProjects,
  tagName,
  branch,
}: {
  tagProjects: string[];
  tagName: string;
  branch: string;
}) => {
  const { initProjectes, folder, gitPrefix } = getConfig();
  // initProjectes 里面的分支必须优先合并
  const initTags = tagProjects.filter((v) => initProjectes.includes(v));
  const projectTags = tagProjects.filter((v) => !initProjectes.includes(v));
  const sp = createOra(``);
  for (const item of tagProjects) {
    if (!fs.existsSync(path.join(folder, item))) {
      sp.text = `正在克隆${item}`;
      const commands = [`git clone ${gitPrefix}/${item}`];
      await execAsync(commands.join("&&"), "", { cwd: folder });
    }
  }
  for (const item of initTags) {
    await createTag(item, tagName, branch, sp, path.join(folder, item));
  }

  for (const item of projectTags) {
    await createTag(item, tagName, branch, sp, path.join(folder, item));
  }
  sp.stop();
  console.log(
    chalk.green(`项目: ${tagProjects.join(",")}的${tagName}标签全部创建完成`)
  );
};
