#!/usr/bin/env node
import { Command, program } from "commander";
import { version } from "../package.json";
import { getConfig, getRCPath, setBranches, setConfig } from "./config";
import { kill } from "process";
import chalk from "chalk";
import fs from "node:fs";
import * as inquirer from "inquirer";
const { createPromptModule } = inquirer.default;
import { handleBuild, handleMerge } from "./build/merge";
import path from "node:path";
import { createOra } from "./ora";
import { checkVersion, execAsync, sleep } from "./util";
import { handleDeploy } from "./build/deploy";
import { RunGitOptions } from "./build/types";
import { createTags } from "./build/tag";
import { updatePackage } from "./build/updateFile";
import { createBranch, mergeBranch } from "./build/branch";

const prompt = createPromptModule();

program.version(version, "-v, --version");

program
  .command("init")
  .argument("[dir]", "工作目录", "")
  .description("初始化工作目录")
  .option("-n, --notCheck", "不校验版本")
  .action(async (dir, { notCheck }) => {
    await checkVersion(prompt, notCheck);
    const sp = createOra("正在进行初始化");
    setConfig({
      folder: dir,
    });
    const { initProjectes, gitPrefix, folder } = getConfig();
    if (dir === "") {
      if (folder) {
        dir = folder;
      } else {
        console.log(chalk.red("请设置工作目录"));
        kill(process.pid);
      }
    }
    const dirs = initProjectes.map((p) => ({
      dir: path.join(dir),
      project: p,
    }));
    const commands: string[][] = [];
    dirs.forEach(({ dir, project }) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(path.join(dir, project))) {
        commands.push([`git clone ${gitPrefix}/${project}`]);
      }
    });
    for (const command of commands) {
      await execAsync(command.join("&&"), "", { cwd: dir });
    }
    sp.text = "初始化完成";
    await sleep(300);
    sp.stop();
  });

const getDeployConfig = async (
  passBuild: boolean,
  onlyBuild?: boolean,
  branchName?: string
) => {
  const { folder, branches, server, projectes, nonMainLineBranches } =
    getConfig();
  // 选择需要部署的项目
  const { deployProjectes } = await prompt({
    type: "list",
    name: "deployProjectes",
    message: "请选择需要部署的项目",
    choices: projectes.concat(nonMainLineBranches).map((v) => ({
      name: v,
      value: v,
    })),
  });
  if (!deployProjectes) {
    console.log(chalk.red(`请选择要部署的项目`));
    kill(process.pid);
  }
  let deployBranch = branchName || "";
  if (!branchName) {
    // 选择需要部署的分支
    const config = await prompt({
      type: "list",
      name: "deployBranch",
      message: "请选择需要部署的分支",
      choices: branches.map((v) => ({
        name: v,
        value: v,
      })),
    });
    deployBranch = config.deployBranch;
  }
  const serverConfig = server[deployBranch] || {};
  if (
    !onlyBuild &&
    (!serverConfig || !serverConfig.host || !serverConfig.serverFolder)
  ) {
    console.log(
      chalk.red(`请先打开[ ${getRCPath()} ], 设置server.${deployBranch}的信息`)
    );
    kill(process.pid);
  }

  // 服务器配置
  const deployConfig: RunGitOptions = {
    host: serverConfig.host,
    branch: deployBranch,
    serverFolder: serverConfig.serverFolder,
    deployProjectes,
    folderPath: path.join(folder),
    passBuild: passBuild,
  };
  return {
    deployConfig,
  };
};

const getProjects = async () => {
  const { projectes, initProjectes, nonMainLineBranches } = getConfig();
  const allProjects = [...initProjectes, ...projectes, ...nonMainLineBranches];
  const { selectProjectes } = await prompt({
    type: "checkbox",
    name: "selectProjectes",
    message: "请选择需要处理的项目",
    choices: [{ name: "全部主线项目", value: "all", checked: true }].concat(
      allProjects.map((v) => {
        return {
          name: v,
          value: v,
          checked: false,
        };
      })
    ),
  });
  return {
    selectProjectes: selectProjectes.includes("all")
      ? allProjects.filter((v) => !nonMainLineBranches.includes(v))
      : selectProjectes,
  };
};

program
  .command("b")
  .argument("[branch]")
  .option("-p", "跳过build")
  .option("-n, --notCheck", "不校验版本")
  .description("只构建")
  .action(async (branch, options) => {
    await checkVersion(prompt, options.notCheck);
    const p = options.passBuild || process.argv.includes("-p");

    const { folder } = getConfig();
    if (!folder) {
      console.log(chalk.red(`请使用[hd-bs init <dir>]进行设置`));
      kill(process.pid);
      return;
    }
    await execAsync(`docker info`, "请先安装并启动docker");
    const { deployConfig } = await getDeployConfig(p, true, branch);
    console.log(
      chalk.green(`所选配置项: ${JSON.stringify(deployConfig, null, 2)}`)
    );
    await handleBuild(deployConfig);
  });

program
  .command("bs")
  .option("-p", "跳过build")
  .option("-n, --notCheck", "不校验版本")
  .description("构建并且部署")
  .action(async (options) => {
    await checkVersion(prompt, options.notCheck);
    const p = options.passBuild || process.argv.includes("-p");
    const { folder } = getConfig();
    if (!folder) {
      console.log(chalk.red(`请使用[hd-bs init <dir>]进行设置`));
      kill(process.pid);
      return;
    }
    await execAsync(`docker info`, "请先安装并启动docker");
    const { deployConfig } = await getDeployConfig(p);
    console.log(
      chalk.green(`所选配置项: ${JSON.stringify(deployConfig, null, 2)}`)
    );
    const tag = await handleBuild(deployConfig);
    if (tag) {
      await handleDeploy(deployConfig, tag);
    }
  });

program
  .command("d")
  .argument("<tag>")
  .option("-n, --notCheck", "不校验版本")
  .description("只部署")
  .action(async (tag: string, { notCheck }) => {
    await checkVersion(prompt, notCheck);
    const { deployConfig } = await getDeployConfig(false);
    await handleDeploy(deployConfig, tag);
  });

program
  .command("m")
  .option("-n, --notCheck", "不校验版本")
  .description("只进行代码的拉取，合并(如果需要), 推送")
  .action(async ({ notCheck }) => {
    await checkVersion(prompt, notCheck);
    const { deployConfig } = await getDeployConfig(false);
    await handleMerge(deployConfig, prompt);
  });

program
  .command("branch")
  .argument("<branch>")
  .option("-f, --from <branch>", "指定来源分支")
  .option("-n, --notCheck", "不校验版本")
  .description("创建新分支")
  .action(async (branch, options) => {
    await checkVersion(prompt, options.notCheck);
    if (!branch) {
      console.log(chalk.red("请输入分支名称"));
      kill(process.pid);
    }
    if (!options?.from) {
      console.log(chalk.red("请使用 -f 或 --from 指定来源分支"));
      kill(process.pid);
    }
    await sleep(10);
    const { selectProjectes } = await getProjects();
    await createBranch({
      branch,
      from: options.from,
      selectProjectes,
    });
  });

program
  .command("merge")
  .argument("<branch>")
  .option("-f, --from <branch>", "指定来源分支")
  .option("-n, --notCheck", "不校验版本")
  .description("合并新分支")
  .action(async (branch, options) => {
    await checkVersion(prompt, options.notCheck);
    if (!branch) {
      console.log(chalk.red("请输入分支名称"));
      kill(process.pid);
    }
    if (!options.from) {
      console.log(chalk.red("请使用 -f 或 --from 指定来源分支"));
      kill(process.pid);
    }
    await sleep(10);
    const { selectProjectes } = await getProjects();
    await mergeBranch({
      branch,
      from: options.from,
      selectProjectes,
    });
  });

program
  .command("tag")
  .argument("<tag>")
  .description("创建标签")
  .option("-f, --from <branch>", "指定来源分支")
  .option("-n, --notCheck", "不校验版本")
  .action(async (tag: string, { from, notCheck }) => {
    await checkVersion(prompt, notCheck);
    if (!tag) {
      console.log(chalk.red("请输入标签名称"));
      kill(process.pid);
    }
    const { projectes, initProjectes, tagBranches, nonMainLineBranches } =
      getConfig();
    let branch = "";
    if (from) {
      branch = from;
    } else {
      const res = await prompt({
        type: "list",
        name: "branch",
        message: "请选择来源分支",
        choices: tagBranches.map((v) => ({
          name: v,
          value: v,
        })),
      });
      branch = res.branch;
    }
    const allProjects = [
      ...initProjectes,
      ...projectes,
      ...nonMainLineBranches,
    ];
    const { tagProjects } = await prompt({
      type: "checkbox",
      name: "tagProjects",
      message: "请选择需要创建标签的项目",
      choices: [{ name: "全部主线项目", value: "all", checked: true }].concat(
        allProjects.map((v) => {
          return {
            name: v,
            value: v,
            checked: false,
          };
        })
      ),
    });
    createTags({
      tagProjects: tagProjects.includes("all")
        ? allProjects.filter((v) => !nonMainLineBranches.includes(v))
        : tagProjects,
      tagName: tag,
      branch,
      isCustom: !!from,
    });
  });

// 修改package.json
program
  .command("u")
  .option("-n, --notCheck", "不校验版本")
  .description("统一修改项目中package.json的某一个配置")
  .argument("<branch>", "统一修改的分支")
  .action(async (branch: string, { notCheck }) => {
    await checkVersion(prompt, notCheck);
    if (!branch) {
      console.log(chalk.red("请输入分支名称"));
      kill(process.pid);
      return;
    }
    const { checkoutAll } = await prompt({
      type: "confirm",
      name: "checkoutAll",
      message: "此操作会放弃所有非新增的更改，是否继续？",
    });
    if (!checkoutAll) {
      kill(process.pid);
      return;
    }
    const { projectes, packageKeys } = getConfig();
    const allProjects = [...projectes];
    const { updateProjects } = await prompt({
      type: "checkbox",
      name: "updateProjects",
      message: "请选择需要修的项目",
      choices: [{ name: "全部", value: "all", checked: true }].concat(
        allProjects.map((v) => {
          return {
            name: v,
            value: v,
            checked: false,
          };
        })
      ),
    });
    const { editKey } = await prompt({
      type: "list",
      name: "editKey",
      choices: packageKeys.map((v) => ({
        name: v,
        value: v,
      })),
    });
    if (!editKey) {
      console.log(chalk.red("请选择要修改的选项"));
      kill(process.pid);
      return;
    }
    const { newVal } = await prompt({
      type: "input",
      name: "newVal",
      message: "请输入新值",
    });
    updatePackage({
      projects: updateProjects.includes("all") ? allProjects : updateProjects,
      branch,
      editKey,
      newVal,
    });
  });

const Config = new Command("config");
Config.command("ls").action(() => {
  console.log(getConfig());
});

Config.command("set")
  .argument("<key>")
  .argument("<value>")
  .description("设置部署配置")
  .action((key, val) => {
    setConfig({ [key]: val });
  });

Config.command("add-branch")
  .argument("<value>", "分支名称")
  .argument("<serverHost>", "服务器host")
  .argument("serverFolder", "服务器上docker所处文件夹")
  .description("增加部署分支")
  .action((val, serverHost, serverFolder) => {
    setBranches(val, 0, serverHost, serverFolder);
  });

Config.command("delete-branch")
  .argument("<value>")
  .description("删除部署分支")
  .action((val) => {
    setBranches(val, 1);
  });
program.addCommand(Config);

program.parse(process.argv);
