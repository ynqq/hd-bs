#!/usr/bin/env node
import { Command, program } from "commander";
import pkg from "./config/index.json";
import { getConfig, getRCPath, setBranches, setConfig } from "./config";
import { kill } from "process";
import chalk from "chalk";
import fs from "node:fs";
import * as inquirer from "inquirer";
const { createPromptModule } = inquirer.default;
import { handleBuild } from "./build/merge";
import path from "node:path";
import { createOra } from "./ora";
import { execAsync, sleep } from "./util";
import { handleDeploy } from "./build/deploy";
import { RunGitOptions } from "./build/types";

const prompt = createPromptModule();

program.version(pkg.version, "-v, --version");

program
  .command("init")
  .argument("[dir]", "工作目录", "")
  .description("初始化工作目录")
  .action(async (dir) => {
    const sp = createOra("正在进行初始化");
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
        commands.push([`cd ${dir}`, `git clone ${gitPrefix}/${project}`]);
      }
    });
    for (const command of commands) {
      await execAsync(command.join("&&"));
    }
    sp.text = "初始化完成";
    await sleep(300);
    sp.stop();
  });

const getDeployConfig = async (passBuild: boolean) => {
  const { folder, branches, server, projectes } = getConfig();
  // 选择需要部署的项目
  const { deployProjectes } = await prompt({
    type: "list",
    name: "deployProjectes",
    message: "请选择需要部署的项目",
    choices: projectes.map((v) => ({
      name: v,
      value: v,
    })),
  });
  if (!deployProjectes) {
    console.log(chalk.red(`请选择要部署的项目`));
    kill(process.pid);
  }
  // 选择需要部署的分支
  const { deployBranch } = await prompt({
    type: "list",
    name: "deployBranch",
    message: "请选择需要部署的分支",
    choices: branches.map((v) => ({
      name: v,
      value: v,
    })),
  });
  const serverConfig = server[deployBranch];
  if (!serverConfig || !serverConfig.host || !serverConfig.serverFolder) {
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

program
  .command("bs")
  .option("-p", "跳过build")
  .description("构建并且部署")
  .action(async (options) => {
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
  .description("只部署")
  .action(async (tag: string) => {
    const { deployConfig } = await getDeployConfig(false);
    await handleDeploy(deployConfig, tag);
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
