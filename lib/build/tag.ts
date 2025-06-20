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
    try {
      await execAsync([`git merge --abort`], "", {
        cwd: folderPath,
      });
    } catch (error) {}
  }
  sp.text = `${project}标签创建完成`;
  await sleep(500);
};

const createCustomTag = async (
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
  const createCommands = [
    `git checkout ${branch}`,
    `git pull`,
    `git tag ${tagName}`,
    `git push ${origin} ${tagName}`,
  ];
  await execAsync(createCommands.join("&&"), "", { cwd: folderPath });
  sp.text = `${project}标签创建完成`;
  await sleep(500);
};

export const createTags = async ({
  tagProjects,
  tagName,
  branch,
  isCustom,
}: {
  tagProjects: string[];
  tagName: string;
  branch: string;
  isCustom: boolean;
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
    if (isCustom) {
      await createCustomTag(item, tagName, branch, sp, path.join(folder, item));
    } else {
      await createTag(item, tagName, branch, sp, path.join(folder, item));
    }
    sp.succeed(`${item} 标签: ${tagName} 创建成功`);
  }

  for (const item of projectTags) {
    if (isCustom) {
      await createCustomTag(item, tagName, branch, sp, path.join(folder, item));
    } else {
      await createTag(item, tagName, branch, sp, path.join(folder, item));
    }
    sp.succeed(`${item} 标签: ${tagName} 创建成功`);
  }
  sp.text = "开始获取远程的标签";
  sp.spinner = "aesthetic";
  sp.start();
  const allProjects = [...initTags, ...projectTags];
  const resList = await Promise.allSettled(
    allProjects.map((item) => {
      return (async () => {
        try {
          await execAsync(`git fetch origin tag ${tagName}`, "", {
            cwd: path.join(folder, item),
          });
        } catch (error) {
          return Promise.reject(item);
        }
      })();
    })
  );
  const errs = resList.filter((v) => v.status === "rejected");
  if (errs.length) {
    console.log(
      chalk.red(errs.map((v) => v.reason).join(",")) + "标签创建失败"
    );
  } else {
    sp.succeed("所有标签创建完成");
  }
};
