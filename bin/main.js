#!/usr/bin/env node
import { program, Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "path";
import rc from "rc";
import os from "os";
import { kill as kill$1 } from "process";
import * as inquirer from "inquirer";
import path$1 from "node:path";
import { exec } from "child_process";
import { execSync } from "node:child_process";
import dayjs from "dayjs";
import ora from "ora";
import { kill } from "node:process";
import { Client } from "ssh2";
const version = "0.0.3";
const userHome = os.homedir();
const npmrcFilePath = path.join(userHome, ".HDDepolyrc");
const getRCPath = () => npmrcFilePath;
const getConfig = () => {
  const config = rc("HDDepoly", {
    buildCommand: "build",
    folder: "",
    branches: ["dev", "test", "hotfix"],
    server: {},
    mergeToTestBranch: "bugfix",
    submodule: "",
    projectSubModule: {},
    origin: "origin",
    image_name_remote: "",
    initProjectes: [],
    gitPrefix: "",
    projectes: [],
    serverConfig: {}
  });
  return config;
};
const setConfig = (config) => {
  const oldConfig = getConfig();
  const configString = { ...oldConfig, ...config };
  fs.writeFileSync(
    npmrcFilePath,
    JSON.stringify(configString, null, 2),
    "utf-8"
  );
  console.log(chalk.green("设置成功"));
};
const setBranches = (newBranch, type, serverHost, serverFolder) => {
  const oldConfig = getConfig();
  const branches = oldConfig.branches;
  const newBranches = type === 0 ? [...branches, newBranch] : branches.filter((v) => v !== newBranch);
  const server = oldConfig.server;
  if (type === 0) {
    Object.assign(server, {
      [newBranch]: {
        host: serverHost,
        serverFolder
      }
    });
  }
  const configString = {
    ...oldConfig,
    server,
    branches: Array.from(new Set(newBranches))
  };
  fs.writeFileSync(
    npmrcFilePath,
    JSON.stringify(configString, null, 2),
    "utf-8"
  );
  console.log(chalk.green(type === 0 ? "新增成功" : "删除成功"));
};
const sleep = (time = 300) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};
const execAsync = (commond, msg, options) => {
  return new Promise((resolve, reject) => {
    const ex = exec(commond, options, (error, stdout) => {
      if (error) {
        msg && console.error(chalk.red(msg));
        reject(error);
        ex.kill();
      }
      resolve(stdout);
    });
  });
};
const createOra = (text, color = "yellow") => {
  const spinner = ora(text).start();
  spinner.color = color;
  return spinner;
};
const LOCK_DOCKERFILE_NAME = `lock.Dockerfile`;
const handleMergeBranch = async (project, branch, folderPath) => {
  const {
    submodule,
    projectSubModule = {},
    mergeToTestBranch,
    origin
  } = getConfig();
  const sp = createOra("正在拉取最新代码");
  if (branch === "test" && mergeToTestBranch) {
    const submoduleFolderName = projectSubModule[project] || submodule;
    if (submoduleFolderName) {
      const commands2 = [
        `cd ${path$1.join(folderPath, `/${submoduleFolderName}`)}`,
        `git pull`,
        `git checkout ${branch}`,
        `git pull ${origin} ${branch}`,
        `git merge ${origin}/${mergeToTestBranch}`,
        `git push ${origin} ${branch}`
      ];
      try {
        await execAsync(commands2.join("&&"));
      } catch (error) {
        console.log(
          chalk.red(
            `${submoduleFolderName} ${mergeToTestBranch} -> test 合并失败`
          )
        );
        execAsync(`code ${path$1.join(folderPath, `/${submoduleFolderName}`)}`);
        kill(process.pid);
      }
    }
    const commands = [
      `cd ${path$1.join(folderPath, `/${project}`)}`,
      `git pull`,
      `git checkout ${branch}`,
      `git pull ${origin} ${mergeToTestBranch}`,
      `git merge ${origin}/${mergeToTestBranch}`,
      `git push ${origin} ${branch}`
    ];
    try {
      await execAsync(commands.join("&&"));
    } catch (error) {
      console.log(
        chalk.red(`${project} ${mergeToTestBranch} -> test 合并失败`)
      );
      execAsync(`code ${path$1.join(folderPath, `/${project}`)}`);
      kill(process.pid);
    }
  } else {
    const commands = [
      `cd ${path$1.join(folderPath, `/${project}`)}`,
      `git checkout ${branch}`,
      `git pull ${origin} ${branch}`
    ];
    try {
      await execAsync(commands.join("&&"));
    } catch (error) {
      execAsync(`code ${path$1.join(folderPath, `/${project}`)}`);
      kill(process.pid);
    }
  }
  sp.color = "green";
  sp.text = "合并完成";
  await sleep(300);
  sp.stop();
};
const getPkgConfig = async (item, folderPath) => {
  const pkg = fs.readFileSync(
    path$1.join(folderPath, `/${item}/package.json`),
    "utf-8"
  );
  try {
    return JSON.parse(pkg);
  } catch (error) {
    return null;
  }
};
const setSubmodule = async (project, branch, folderPath) => {
  var _a, _b;
  const sp = createOra("正在初始化子仓库");
  const gitmodules_file = ".gitmodules";
  const filePath = path$1.join(folderPath, `/${project}/${gitmodules_file}`);
  const fileData = fs.readFileSync(filePath, "utf-8");
  fs.writeFileSync(
    filePath,
    fileData.replace(/(branch\s+=).*(\n)/, `$1${branch}$2`)
  );
  const commands = [
    `cd ${path$1.join(folderPath, `/${project}`)}`,
    "git submodule deinit -f --all"
  ];
  await execAsync(commands.join("&&"));
  fs.rmSync(
    path$1.join(`${path$1.join(folderPath, `/${project}`)}`, ".git/modules"),
    {
      recursive: true,
      force: true
    }
  );
  const res = await execAsync(
    [
      `cd ${path$1.join(folderPath, `/${project}`)}`,
      "git submodule init",
      "git submodule update --remote"
    ].join("&&")
  );
  const submoduleCommitId = (_b = (_a = res.split(" ").at(-1)) == null ? void 0 : _a.replace) == null ? void 0 : _b.call(_a, "\n", "");
  console.log(
    chalk.blue(
      `
${project}子仓库commitId: ${chalk.red(submoduleCommitId)} ${chalk.red(
        "\n请确认是否正确！！！"
      )}`
    )
  );
  sp.text = "子仓库初始化完成";
  sp.color = "green";
  await sleep(300);
  sp.stop();
};
const genLogFile = async ({ projectVersion, name }, item, folderPath) => {
  const sp = createOra("正在生成version文件");
  const cdCommand = `${path$1.join(folderPath, `/${item}`)}`;
  const version2 = projectVersion;
  const imageName = `local/vue/${name.slice(8)}`;
  const branch = execSync(`cd ${cdCommand} && git rev-parse --abbrev-ref HEAD`).toString().trim();
  const buildUserName = execSync(`cd ${cdCommand} && git show -s --format=%cn`).toString().trim();
  const buildTime = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const gitLog = execSync(
    `cd ${cdCommand} && git log -6 --date=format:"%Y-%m-%d %H:%M:%S" --pretty=format:"提交人：%an <br> 提交时间：%ad <div>提交信息：%s</div><br>"`
  ).toString().trim().replace(/\n/g, "");
  const gitCoreLog = execSync(
    `cd ${cdCommand} && git submodule foreach git log -6 --date=format:"%Y-%m-%d %H:%M:%S" --pretty=format:"提交人：%an <br> 提交时间：%ad <div>提交信息：%s</div><br>"`
  ).toString().trim().replace(/\n/g, "").replace(/Entering '(plm-vue-)?core'/, "");
  const content = `{
  "branch": "${branch}",
  "tag": "${branch}.${version2}.${String(Date.now()).slice(-4)}",
  "imageName": "${imageName}",
  "buildUserName": "${buildUserName}",
  "buildTime": "${buildTime}",
  "gitLog": "${gitLog}",
  "gitCoreLog": "${gitCoreLog}"
}
`;
  console.log(`
 ${chalk.blue(`version信息:`)} ${chalk.blue(content)}`);
  fs.writeFileSync(
    path$1.join(folderPath, `/${item}/public/version.json`),
    content
  );
  sp.text = "version文件生成成功";
  sp.color = "green";
  await sleep(300);
  sp.stop();
  return JSON.parse(content);
};
const buildDockerImg = async (tag, imageName, folderPath, item) => {
  const { image_name_remote } = getConfig();
  const project = item.replace(/plm-vue-(.*)/, "$1");
  let new_image_name_remote = `${image_name_remote}${project}`;
  const commands = [
    `cd ${path$1.join(folderPath, `/${item}`)}`,
    `docker build -f ${LOCK_DOCKERFILE_NAME} -t ${imageName}:${tag} .`,
    `docker tag ${imageName}:${tag} ${new_image_name_remote}:${tag}`,
    `docker push ${new_image_name_remote}:${tag}`
  ];
  const sp = createOra("正在生成docker镜像");
  await execAsync(commands.join("&&"));
  sp.text = "docker镜像生成成功";
  sp.color = "green";
  await sleep(300);
  console.log(chalk.green(`镜像生成成功: ${new_image_name_remote}:${tag}`));
  sp.stop();
  return `${new_image_name_remote}:${tag}`;
};
const runBuild = async (folderPath, item) => {
  const { buildCommand } = getConfig();
  const commands = [
    `cd ${path$1.join(folderPath, `/${item}`)}`,
    `npm config set registry  https://registry.npmmirror.com`,
    `npm i --force`,
    `npm run ${buildCommand}`
  ];
  const sp = createOra("正在执行构建命令");
  await execAsync(commands.join("&&"), "构建失败", {
    env: process.env
  });
  sp.text = "构建成功";
  sp.color = "green";
  await sleep(300);
  sp.stop();
};
const initProject = async ({
  project,
  projectPath,
  folderPath
}) => {
  const { gitPrefix } = getConfig();
  if (!fs.existsSync(projectPath)) {
    const sp = await createOra(`正在初始化${project}`);
    const commands = [`cd ${folderPath}`, `git clone ${gitPrefix}/${project}`];
    await execAsync(commands.join("&&"));
    sp.text = `${project}初始化完成`;
    await sleep(300);
    sp.stop();
  }
};
const createLocalDockerfile = async ({ projectPath }, thirdPartyUrl) => {
  const p = path$1.join(projectPath, LOCK_DOCKERFILE_NAME);
  const ignoreFile = path$1.join(projectPath, ".dockerignore");
  if (fs.existsSync(ignoreFile)) {
    const ignoreContext = fs.readFileSync(ignoreFile, "utf-8");
    fs.writeFileSync(ignoreFile, ignoreContext.replace(/dist\//, ""));
  }
  const context = `FROM ${thirdPartyUrl}/nginx:1.27.1-alpine

EXPOSE 80

COPY ./dist /usr/share/nginx/html/
`;
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, context);
  }
};
const handleBuild = async (options) => {
  const { deployProjectes, branch, folderPath, passBuild } = options;
  const project = deployProjectes;
  const projectPath = path$1.join(folderPath, project);
  const pubOptions = {
    projectPath,
    folderPath,
    project
  };
  await initProject(pubOptions);
  if (!passBuild) {
    handleMergeBranch(project, branch, folderPath);
  }
  const pkg = await getPkgConfig(project, folderPath);
  if (pkg) {
    const { projectVersion, thirdPartyUrl } = pkg;
    await createLocalDockerfile(pubOptions, thirdPartyUrl);
    const random_number = [...new Array(4)].map(() => Math.random() * 10 | 0).join("");
    const tag = `${branch}.${projectVersion}.${random_number}`;
    if (!passBuild) {
      await setSubmodule(project, branch, folderPath);
    }
    const { imageName } = await genLogFile(pkg, project, folderPath);
    if (!passBuild) {
      await runBuild(folderPath, project);
    }
    return await buildDockerImg(tag, imageName, folderPath, project);
  }
};
const handleDeploy = async (deployConfig, tag) => {
  const { serverConfig, image_name_remote } = getConfig();
  const hostConfig = serverConfig[deployConfig.host];
  if (!hostConfig) {
    console.log(chalk.red(`请设置${deployConfig.host}的服务器用户名和密码`));
    kill$1(process.pid);
  }
  const { username, password, sudoPassword, dockerDir } = hostConfig;
  const config = {
    host: deployConfig.host,
    port: 22,
    username,
    password
  };
  const project = deployConfig.deployProjectes.replace(/plm-vue-(.*)/, "$1");
  const envTag = tag.replace(`${image_name_remote}${project}:`, "");
  const envKey = `vue_${project}_tag`;
  const { serverFolder } = deployConfig;
  const commands = `cd ${dockerDir}/${serverFolder}/ &&     echo '${sudoPassword}' | sudo -S sed -i  "s/${envKey}=.*/${envKey}=${envTag}/g" .env &&     echo '${sudoPassword}' | sudo -S docker-compose build &&     echo '${sudoPassword}' | sudo -S docker-compose stop web &&     echo '${sudoPassword}' | sudo -S docker-compose up -d web`;
  const conn = new Client();
  conn.on("ready", () => {
    console.log(chalk.green("连接成功"));
    conn.exec(commands, (err, stream) => {
      if (err) {
        console.log(chalk.red("执行报错"));
        kill$1(process.pid);
        return;
      }
      stream.on("close", () => {
        console.log(chalk.green(`${deployConfig.deployProjectes}部署完成`));
        conn.end();
      }).on("data", (data) => {
        console.log(`STDOUT: ${data}`);
      }).stderr.on("data", (data) => {
        console.log(`STDERR: ${data}`);
      });
    });
  }).connect(config);
};
const { createPromptModule } = inquirer.default;
const prompt = createPromptModule();
program.version(version, "-v, --version");
program.command("init").argument("[dir]", "工作目录", "").description("初始化工作目录").action(async (dir) => {
  const sp = createOra("正在进行初始化");
  setConfig({
    folder: dir
  });
  const { initProjectes, gitPrefix, folder } = getConfig();
  if (dir === "") {
    if (folder) {
      dir = folder;
    } else {
      console.log(chalk.red("请设置工作目录"));
      kill$1(process.pid);
    }
  }
  const dirs = initProjectes.map((p) => ({
    dir: path$1.join(dir),
    project: p
  }));
  const commands = [];
  dirs.forEach(({ dir: dir2, project }) => {
    if (!fs.existsSync(dir2)) {
      fs.mkdirSync(dir2, { recursive: true });
    }
    if (!fs.existsSync(path$1.join(dir2, project))) {
      commands.push([`cd ${dir2}`, `git clone ${gitPrefix}/${project}`]);
    }
  });
  for (const command of commands) {
    await execAsync(command.join("&&"));
  }
  sp.text = "初始化完成";
  await sleep(300);
  sp.stop();
});
const getDeployConfig = async (passBuild) => {
  const { folder, branches, server, projectes } = getConfig();
  const { deployProjectes } = await prompt({
    type: "list",
    name: "deployProjectes",
    message: "请选择需要部署的项目",
    choices: projectes.map((v) => ({
      name: v,
      value: v
    }))
  });
  if (!deployProjectes) {
    console.log(chalk.red(`请选择要部署的项目`));
    kill$1(process.pid);
  }
  const { deployBranch } = await prompt({
    type: "list",
    name: "deployBranch",
    message: "请选择需要部署的分支",
    choices: branches.map((v) => ({
      name: v,
      value: v
    }))
  });
  const serverConfig = server[deployBranch];
  if (!serverConfig || !serverConfig.host || !serverConfig.serverFolder) {
    console.log(
      chalk.red(`请先打开[ ${getRCPath()} ], 设置server.${deployBranch}的信息`)
    );
    kill$1(process.pid);
  }
  const deployConfig = {
    host: serverConfig.host,
    branch: deployBranch,
    serverFolder: serverConfig.serverFolder,
    deployProjectes,
    folderPath: path$1.join(folder),
    passBuild
  };
  return {
    deployConfig
  };
};
program.command("bs").option("-p", "跳过build").description("构建并且部署").action(async (options) => {
  const p = options.passBuild || process.argv.includes("-p");
  const { folder } = getConfig();
  if (!folder) {
    console.log(chalk.red(`请使用[hd-bs init <dir>]进行设置`));
    kill$1(process.pid);
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
program.command("d").argument("<tag>").description("只部署").action(async (tag) => {
  const { deployConfig } = await getDeployConfig(false);
  await handleDeploy(deployConfig, tag);
});
const Config = new Command("config");
Config.command("ls").action(() => {
  console.log(getConfig());
});
Config.command("set").argument("<key>").argument("<value>").description("设置部署配置").action((key, val) => {
  setConfig({ [key]: val });
});
Config.command("add-branch").argument("<value>", "分支名称").argument("<serverHost>", "服务器host").argument("serverFolder", "服务器上docker所处文件夹").description("增加部署分支").action((val, serverHost, serverFolder) => {
  setBranches(val, 0, serverHost, serverFolder);
});
Config.command("delete-branch").argument("<value>").description("删除部署分支").action((val) => {
  setBranches(val, 1);
});
program.addCommand(Config);
program.parse(process.argv);
