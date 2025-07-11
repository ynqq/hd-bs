#!/usr/bin/env node
import { program, Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path, { join } from "path";
import rc from "rc";
import os from "os";
import { kill as kill$1 } from "process";
import * as inquirer from "inquirer";
import path$1 from "node:path";
import { exec } from "child_process";
import ora from "ora";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "node:child_process";
import dayjs from "dayjs";
import { kill } from "node:process";
import { Client } from "ssh2";
const version = "0.0.26";
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
    nonMainLineBranches: [],
    serverConfig: {},
    tagBranches: ["hotfix", "test"],
    packageKeys: ["projectVersion", "pkgImage", "customUrl", "thirdPartyUrl"]
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
const createOra = (text, color = "yellow") => {
  const spinner = ora(text).start();
  spinner.color = color;
  return spinner;
};
const sleep = (time = 300) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};
const execAsync = (commond, msg, options) => {
  return new Promise((resolve, reject) => {
    const ex = exec(
      Array.isArray(commond) ? commond.join("&&") : commond,
      options,
      (error, stdout) => {
        if (error) {
          msg && console.error(chalk.red(msg));
          reject(error);
          ex.kill();
        }
        resolve(stdout);
      }
    );
  });
};
const getGitStatus = async (cwd) => {
  const status = await execAsync("git status -s", "", { cwd });
  const lines = status.trim().split("\n");
  return lines.map((line) => {
    const [status2, file] = line.trim().split(/\s+(.+)/);
    return { status: status2, file };
  });
};
const hasconflict = async (cwd) => {
  const status = await getGitStatus(cwd);
  return status.some((item) => {
    return item.status.includes("UU");
  });
};
const checkVersion = async (prompt2, noCheck) => {
  if (noCheck) {
    return;
  }
  const sp = createOra("正在检查版本");
  let npmVersion = await execAsync("npm view hd-bs version");
  npmVersion = npmVersion.trim().replace(/\n/, "");
  sp.stop();
  if (npmVersion !== version) {
    await prompt2({
      type: "confirm",
      name: "update",
      message: `当前版本${version}，最新版本${npmVersion}，是否更新？`,
      default: true
    }).then(async ({ update }) => {
      if (update) {
        sp.spinner = "monkey";
        sp.text = `正在更新至${npmVersion}`;
        sp.start();
        await execAsync(`npm i hd-bs@latest -g`, "更新中...");
        sp.text = "更新完成";
        sp.spinner = "smiley";
        await sleep(1e3);
        sp.stop();
      }
    });
  }
};
const checkProjectDir = async (projects, branch) => {
  const sp = createOra("项目初始化");
  const { folder, gitPrefix } = getConfig();
  const hasBranchProjects = [], notHasBranchProjects = [];
  for (const item of projects) {
    const projectPath = join(folder, item);
    if (!existsSync(projectPath)) {
      sp.text = `正在克隆${item}`;
      const commands = [`git clone ${gitPrefix}/${item}`];
      await execAsync(commands.join("&&"), "", { cwd: folder });
    }
    if (branch) {
      if (!await checkHasBranch(branch, projectPath, item, sp)) {
        sp.stop();
        notHasBranchProjects.push(item);
        continue;
      }
      sp.text = `${item}正在清理更改并切换到${branch}`;
      await execAsync(
        `git checkout -q -- . && git checkout ${branch} && git pull`,
        "",
        {
          cwd: projectPath
        }
      );
      hasBranchProjects.push(item);
    } else {
      hasBranchProjects.push(item);
    }
  }
  sp.succeed("项目切换完成");
  return { has: hasBranchProjects, notHas: notHasBranchProjects };
};
const checkHasBranch = async (branch, folderPath, project, sp) => {
  const allBranches = await execAsync([`git branch --all | grep remotes`], "", {
    cwd: folderPath
  });
  const { origin } = getConfig();
  if (!allBranches.includes(`remotes/${origin}/${branch}`)) {
    sp.fail(
      chalk.yellowBright(`${project} 分支: ${branch} ${chalk.red("不存在")}`)
    );
    return false;
  }
  return true;
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
  sp.text = `正在拉取最新代码`;
  sp.spinner = "fingerDance";
  sp.start();
  if (branch === "test" && mergeToTestBranch) {
    const submoduleFolderName = projectSubModule[project] || submodule;
    if (submoduleFolderName) {
      const commands2 = [
        `git pull`,
        `git checkout ${branch}`,
        `git pull ${origin} ${branch}`,
        `git merge ${origin}/${mergeToTestBranch}`,
        `git push ${origin} ${branch}`
      ];
      try {
        await execAsync(commands2.join("&&"), "", {
          cwd: path$1.join(folderPath, `/${submoduleFolderName}`)
        });
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
      `git pull`,
      `git checkout ${branch}`,
      `git pull ${origin} ${mergeToTestBranch}`,
      `git merge ${origin}/${mergeToTestBranch}`,
      `git push ${origin} ${branch}`
    ];
    try {
      await execAsync(commands.join("&&"), "", {
        cwd: path$1.join(folderPath, `/${project}`)
      });
    } catch (error) {
      console.log(
        chalk.red(`${project} ${mergeToTestBranch} -> test 合并失败`)
      );
      execAsync(`code ${path$1.join(folderPath, `/${project}`)}`);
      kill(process.pid);
    }
  } else {
    const commands = [
      `git fetch ${origin}`,
      `git checkout ${branch}`,
      `git pull`
    ];
    try {
      await execAsync(commands.join("&&"), "", {
        cwd: path$1.join(folderPath, `/${project}`)
      });
    } catch (error) {
      execAsync(`code ${path$1.join(folderPath, `/${project}`)}`);
      kill(process.pid);
      return Promise.reject(error);
    }
  }
  sp.succeed("合并完成");
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
    fileData.replace(/(branch\s+=).*(\n?)/, `$1${branch}$2`)
  );
  try {
    const commands = ["git submodule deinit -f --all"];
    await execAsync(commands.join("&&"), "", {
      cwd: path$1.join(folderPath, `/${project}`)
    });
    fs.rmSync(
      path$1.join(`${path$1.join(folderPath, `/${project}`)}`, ".git/modules"),
      {
        recursive: true,
        force: true
      }
    );
  } catch (error) {
  }
  const res = await execAsync(
    ["git submodule init", "git submodule update --remote"].join("&&"),
    "",
    { cwd: path$1.join(folderPath, `/${project}`) }
  );
  const submoduleCommitId = (_b = (_a = res.split(" ").at(-1)) == null ? void 0 : _a.replace) == null ? void 0 : _b.call(_a, "\n", "");
  sp.succeed(`子仓库初始化完成: ${submoduleCommitId}`);
};
const genLogFile = async ({ projectVersion, name }, item, folderPath) => {
  const sp = createOra("正在生成version文件");
  const cdCommand = `${path$1.join(folderPath, `/${item}`)}`;
  const version2 = projectVersion;
  const imageName = `local/vue/${name.slice(8)}`;
  const branch = execSync(`git rev-parse --abbrev-ref HEAD`, {
    cwd: cdCommand
  }).toString().trim();
  const buildTime = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const gitLog = execSync(
    `git log -6 --date=format:"%Y-%m-%d %H:%M:%S" --pretty=format:"commitId: %H <div>commitTime: %ad</div><br>"`,
    {
      cwd: cdCommand
    }
  ).toString().trim().replace(/\n/g, "");
  const gitCoreLog = execSync(
    `git submodule foreach git log -6 --date=format:"%Y-%m-%d %H:%M:%S" --pretty=format:"commitId: %H <div>commitTime: %ad</div><br>"`,
    {
      cwd: cdCommand
    }
  ).toString().trim().replace(/\n/g, "").replace(/Entering '(plm-vue-)?core'/, "");
  const content = `{
  "branch": "${branch}",
  "tag": "${branch}.${version2}.${String(Date.now()).slice(-4)}",
  "imageName": "${imageName}",
  "buildTime": "${buildTime}",
  "gitLog": "${gitLog}",
  "gitCoreLog": "${gitCoreLog}"
}
`;
  fs.writeFileSync(
    path$1.join(folderPath, `/${item}/public/version.json`),
    content
  );
  sp.succeed("version文件生成成功");
  console.log(`
 ${chalk.blue(`version信息:`)} ${chalk.blue(content)}`);
  return JSON.parse(content);
};
const buildDockerImg = async (tag, imageName, folderPath, item) => {
  const { image_name_remote } = getConfig();
  const project = item.replace(/plm-vue-(.*)/, "$1");
  let new_image_name_remote = `${image_name_remote}${project}`;
  const commands = [
    `docker build -f ${LOCK_DOCKERFILE_NAME} -t ${imageName}:${tag} .`,
    `docker tag ${imageName}:${tag} ${new_image_name_remote}:${tag}`,
    `docker push ${new_image_name_remote}:${tag}`
  ];
  const sp = createOra("正在生成docker镜像");
  sp.spinner = "fistBump";
  await execAsync(commands.join("&&"), "", {
    cwd: path$1.join(folderPath, `/${item}`)
  });
  sp.text = "docker镜像生成成功";
  sp.color = "green";
  await sleep(300);
  sp.succeed(`镜像生成成功: ${new_image_name_remote}:${tag}`);
  {
    fs.rmSync(path$1.join(folderPath, `/${item}/public/version.json`));
    fs.rmSync(path$1.join(folderPath, `/${item}/${LOCK_DOCKERFILE_NAME}`));
    const commands2 = [
      `git checkout -- .gitmodules`,
      `git checkout -- .dockerignore`
    ];
    await execAsync(commands2.join("&&"), "", {
      cwd: path$1.join(folderPath, `/${item}`)
    });
  }
  return `${new_image_name_remote}:${tag}`;
};
const runBuild = async (folderPath, item) => {
  const { buildCommand } = getConfig();
  const commands = [
    `npm config set registry  https://registry.npmmirror.com`,
    `npm i --force`,
    `npm run ${buildCommand}`
  ];
  const sp = createOra("正在执行构建命令");
  sp.spinner = "soccerHeader";
  await execAsync(commands.join("&&"), "构建失败", {
    env: process.env,
    cwd: path$1.join(folderPath, `/${item}`)
  });
  sp.text = "构建成功";
  sp.color = "green";
  await sleep(300);
  sp.succeed("构建成功");
};
const initProject = async ({
  project,
  projectPath,
  folderPath
}) => {
  const { gitPrefix } = getConfig();
  if (!fs.existsSync(projectPath)) {
    const sp = await createOra(`正在初始化${project}`);
    const commands = [`git clone ${gitPrefix}/${project}`];
    await execAsync(commands.join("&&"), "", { cwd: folderPath });
    sp.text = `${project}初始化完成`;
    await sleep(300);
    sp.succeed(`${project}初始化完成`);
  }
};
const createLocalDockerfile = async ({ projectPath }, thirdPartyUrl) => {
  const sp = createOra("正在生成dockerfile");
  sp.spinner = "runner";
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
    sp.succeed("dockerfile生成成功");
  } else {
    sp.succeed("dockerfile已存在");
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
    await handleMergeBranch(project, branch, folderPath);
  }
  const pkg = await getPkgConfig(project, folderPath);
  if (pkg) {
    const { projectVersion, thirdPartyUrl, appointVueCoreBranch } = pkg;
    await createLocalDockerfile(pubOptions, thirdPartyUrl);
    const random_number = [...new Array(4)].map(() => Math.random() * 10 | 0).join("");
    const tag = `${branch.replace(
      /\//g,
      "_"
    )}.${projectVersion}.${random_number}`;
    if (!passBuild) {
      await setSubmodule(project, appointVueCoreBranch || branch, folderPath);
    }
    const { imageName } = await genLogFile(pkg, project, folderPath);
    if (!passBuild) {
      await runBuild(folderPath, project);
    }
    return await buildDockerImg(tag, imageName, folderPath, project);
  }
};
const handleMerge = async (options, prompt2) => {
  const { deployProjectes, branch, folderPath } = options;
  const project = deployProjectes;
  const projectPath = path$1.join(folderPath, project);
  const pubOptions = {
    projectPath,
    folderPath,
    project
  };
  await initProject(pubOptions);
  const sp = createOra("准备进行合并");
  sp.spinner = "runner";
  sp.text = `正在合并${project}`;
  const status = (await getGitStatus(projectPath)).filter(
    (v) => v.file !== "core"
  );
  if (status.length) {
    sp.stop();
    const { isContinue } = await prompt2({
      type: "confirm",
      name: "isContinue",
      message: `当前有未提交的文件，是否清理并继续？`,
      default: false
    });
    if (isContinue) {
      sp.text = `正在清理未提交的文件`;
      sp.spinner = "fistBump";
      sp.start();
      const commands = [`git checkout -q -- .`, `git clean -fd`];
      await execAsync(commands.join("&&"), "", {
        cwd: projectPath
      });
      sp.succeed("清理完成");
    } else {
      kill(process.pid);
      return;
    }
  } else {
    sp.stop();
  }
  await handleMergeBranch(project, branch, folderPath);
};
const handleDeploy = async (deployConfig, tag) => {
  const { serverConfig, image_name_remote } = getConfig();
  const hostConfig = serverConfig[deployConfig.host];
  if (!hostConfig) {
    console.log(chalk.red(`请设置${deployConfig.host}的服务器用户名和密码`));
    kill$1(process.pid);
  }
  const { username, password, sudoPassword, dockerDir, noRoot } = hostConfig;
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
  const root = noRoot ? "" : "sudo -S";
  const commands = `cd ${dockerDir}/${serverFolder}/ &&     echo '${sudoPassword}' | ${root} sed -i  "s/${envKey}=.*/${envKey}=${envTag}/g" .env &&     echo '${sudoPassword}' | ${root} docker-compose build &&     echo '${sudoPassword}' | ${root} docker-compose stop web &&     echo '${sudoPassword}' | ${root} docker-compose up -d web`;
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
const { createPromptModule: createPromptModule$1 } = inquirer.default;
const prompt$1 = createPromptModule$1();
const masterName = "master";
const createTag = async (project, tagName, branch, sp, folderPath) => {
  const { origin } = getConfig();
  await execAsync([`git pull`].join("&&"), "", { cwd: folderPath });
  const commamds = [`git tag -l "${tagName}"`];
  const existTag = (await execAsync(commamds.join("&&"), "", { cwd: folderPath })).trim();
  if (existTag) {
    sp.stop();
    console.log(chalk.red(`${project}标签${tagName}已存在`));
    const { existAction } = await prompt$1({
      type: "list",
      name: "existAction",
      message: `${project}标签${tagName}已存在，请选择下一步操作。`,
      choices: [
        { name: "删除并重新创建", value: "delete" },
        { name: "跳过此项目", value: "pass" },
        { name: "终止操作", value: "stop" }
      ]
    });
    if (existAction === "stop") {
      kill$1(process.pid);
      return;
    }
    if (existAction === "delete") {
      sp.stop();
      const { remoteTagIsDelete } = await prompt$1({
        type: "confirm",
        message: `${project}远程的${tagName}是否已经删除？`,
        name: "remoteTagIsDelete"
      });
      if (!remoteTagIsDelete) {
        console.log(chalk.red(`请先删除${project}远程的${tagName}标签`));
        kill$1(process.pid);
      }
      const deleteTagCommands = [`git tag -d ${tagName}`];
      await execAsync(deleteTagCommands.join("&&"), "", { cwd: folderPath });
    } else if (existAction === "pass") {
      return;
    }
  }
  sp.text = `正在创建${project}的标签: ${tagName}`;
  sp.start();
  if (branch === "hotfix") {
    const createCommands = [
      `git checkout ${branch}`,
      `git pull`,
      `git tag ${tagName}`,
      `git push ${origin} ${tagName}`,
      `git checkout ${masterName}`,
      `git pull`,
      `git merge ${origin}/${branch}`
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
      } catch (error) {
      }
      kill$1(process.pid);
      return;
    }
    await execAsync([`git push ${origin} ${masterName}`].join("&&"), "", {
      cwd: folderPath
    });
  } else {
    const createCommands = [
      `git pull`,
      `git checkout ${masterName}`,
      `git pull`,
      `git merge ${origin}/${branch}`
    ];
    await execAsync(createCommands.join("&&"), "", { cwd: folderPath });
    const conflict = await hasconflict(folderPath);
    if (conflict) {
      sp.stop();
      try {
        execAsync(`code ${folderPath}`);
      } catch (error) {
      }
      console.log(
        chalk.red(
          `${project}:${branch}->${masterName}合并存在冲突，请联系开发进行处理`
        )
      );
      kill$1(process.pid);
      return;
    }
    await execAsync(
      [
        `git push ${origin} ${masterName}`,
        `git tag ${tagName}`,
        `git push ${origin} ${tagName}`
      ].join("&&"),
      "",
      { cwd: folderPath }
    );
  }
  try {
    const mergeMasterToDevCommands = [
      `git checkout dev`,
      `git pull`,
      `git merge ${origin}/${masterName}`,
      `git push ${origin} dev`
    ];
    await execAsync(mergeMasterToDevCommands.join("&&"), "", {
      cwd: folderPath
    });
  } catch (error) {
    console.log(
      chalk.red(`${project}${masterName}->dev合并失败，请联系开发进行处理`)
    );
    try {
      await execAsync([`git merge --abort`], "", {
        cwd: folderPath
      });
    } catch (error2) {
    }
  }
  sp.text = `${project}标签创建完成`;
  await sleep(500);
};
const createCustomTag = async (project, tagName, branch, sp, folderPath) => {
  const { origin } = getConfig();
  const allBranches = await execAsync([`git branch --all | grep remotes`], "", {
    cwd: folderPath
  });
  if (!allBranches.includes(`remotes/${origin}/${branch}`)) {
    sp.fail(
      chalk.yellowBright(`${project} 分支: ${branch} ${chalk.red("不存在")}`)
    );
    return false;
  }
  await execAsync([`git pull`].join("&&"), "", { cwd: folderPath });
  const commamds = [`git tag -l "${tagName}"`];
  const existTag = (await execAsync(commamds.join("&&"), "", { cwd: folderPath })).trim();
  if (existTag) {
    sp.stop();
    console.log(chalk.red(`${project}标签${tagName}已存在`));
    const { existAction } = await prompt$1({
      type: "list",
      name: "existAction",
      message: `${project}标签${tagName}已存在，请选择下一步操作。`,
      choices: [
        { name: "删除并重新创建", value: "delete" },
        { name: "跳过此项目", value: "pass" },
        { name: "终止操作", value: "stop" }
      ]
    });
    if (existAction === "stop") {
      kill$1(process.pid);
      return false;
    }
    if (existAction === "delete") {
      sp.stop();
      const { remoteTagIsDelete } = await prompt$1({
        type: "confirm",
        message: `${project}远程的${tagName}是否已经删除？`,
        name: "remoteTagIsDelete"
      });
      if (!remoteTagIsDelete) {
        console.log(chalk.red(`请先删除${project}远程的${tagName}标签`));
        kill$1(process.pid);
      }
      const deleteTagCommands = [`git tag -d ${tagName}`];
      await execAsync(deleteTagCommands.join("&&"), "", { cwd: folderPath });
    } else if (existAction === "pass") {
      return false;
    }
  }
  const createCommands = [
    `git checkout ${branch}`,
    `git pull`,
    `git tag ${tagName}`,
    `git push ${origin} ${tagName}`
  ];
  await execAsync(createCommands.join("&&"), "", { cwd: folderPath });
  sp.text = `${project}标签创建完成`;
  await sleep(500);
  return true;
};
const createTags = async ({
  tagProjects,
  tagName,
  branch,
  isCustom
}) => {
  const { initProjectes, folder, gitPrefix } = getConfig();
  const initTags = tagProjects.filter((v) => initProjectes.includes(v));
  const projectTags = tagProjects.filter((v) => !initProjectes.includes(v));
  const sp = createOra(``);
  const notHasBranch = [];
  for (const item of tagProjects) {
    if (!fs.existsSync(path.join(folder, item))) {
      sp.text = `正在克隆${item}`;
      const commands = [`git clone ${gitPrefix}/${item}`];
      await execAsync(commands.join("&&"), "", { cwd: folder });
    }
  }
  for (const item of initTags) {
    let success = true;
    if (isCustom) {
      success = await createCustomTag(
        item,
        tagName,
        branch,
        sp,
        path.join(folder, item)
      );
    } else {
      await createTag(item, tagName, branch, sp, path.join(folder, item));
    }
    if (success) {
      sp.succeed(`${item} 标签: ${tagName} 创建成功`);
    } else {
      notHasBranch.push(item);
    }
  }
  for (const item of projectTags) {
    let success = true;
    if (isCustom) {
      success = await createCustomTag(
        item,
        tagName,
        branch,
        sp,
        path.join(folder, item)
      );
    } else {
      await createTag(item, tagName, branch, sp, path.join(folder, item));
    }
    if (success) {
      sp.succeed(`${item} 标签: ${tagName} 创建成功`);
    } else {
      notHasBranch.push(item);
    }
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
            cwd: path.join(folder, item)
          });
          return item;
        } catch (error) {
          return Promise.reject(item);
        }
      })();
    })
  );
  const errs = resList.filter(
    (v) => v.status === "rejected" && !notHasBranch.includes(v.reason)
  );
  if (errs.length) {
    sp.stop();
    console.log(
      chalk.red(errs.map((v) => v.reason).join(",")) + "标签创建失败"
    );
  } else {
    sp.succeed("所有标签创建完成");
  }
};
const updatePackage = async (options) => {
  const { projects, branch, editKey, newVal } = options;
  const { folder, origin } = getConfig();
  const { has, notHas } = await checkProjectDir(projects, branch);
  const sp = createOra("开始修改");
  for (const project of projects.filter((v) => has.includes(v))) {
    const filePath = join(folder, project, "/package.json");
    const reg = new RegExp(`("${editKey}":\\s+").+(",?
?)`);
    const str = readFileSync(filePath, "utf-8").replace(reg, `$1${newVal}$2`);
    writeFileSync(filePath, str);
    const files = getGitStatus(join(folder, project));
    if ((await files).some((v) => v.file === "package.json")) {
      sp.text = `${project}修改完成,正在进行提交`;
      const commonds = [
        `git add package.json`,
        `git commit -m "chore: 修改package.json ${editKey}==>${newVal}"`,
        `git push ${origin} ${branch}`
      ];
      await execAsync(commonds, "", { cwd: join(folder, project) });
      sp.succeed(`${project}修改并提交完成`);
    } else {
      sp.succeed(`${project}无需修改`);
    }
  }
  sp.succeed(
    `已将${chalk.green(
      `含有${branch}分支`
    )}的所有项目package.json中${editKey}的值改为${newVal}。${chalk.red(
      `${notHas.join(",")}不存在${branch}分支`
    )}`
  );
};
const createBranch = async (config) => {
  const { branch, from, selectProjectes } = config;
  const { folder, origin } = getConfig();
  for (const item of selectProjectes) {
    const sp = createOra("");
    const cwd = path$1.join(folder, item);
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
          `git push -u origin ${branch}`
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
const mergeBranch = async (config) => {
  const { branch, from, selectProjectes } = config;
  const { folder, origin } = getConfig();
  for (const item of selectProjectes) {
    const sp = createOra("");
    const cwd = path$1.join(folder, item);
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
          `git push origin ${branch}`
        ],
        "",
        { cwd }
      );
    } catch (error) {
      sp.stop();
      sp.fail(`${item} ${branch} 分支合并失败`);
      try {
        execAsync(["code ./"], "", { cwd });
      } catch (error2) {
      }
      continue;
    }
    sp.succeed(
      `${chalk.green(item)} ${chalk.green(from)} -> ${chalk.green(
        branch
      )} 分支合并成功`
    );
  }
};
const { createPromptModule } = inquirer.default;
const prompt = createPromptModule();
program.version(version, "-v, --version");
program.command("init").argument("[dir]", "工作目录", "").description("初始化工作目录").option("-n, --notCheck", "不校验版本").action(async (dir, { notCheck }) => {
  await checkVersion(prompt, notCheck);
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
const getDeployConfig = async (passBuild, onlyBuild, branchName) => {
  const { folder, branches, server, projectes, nonMainLineBranches } = getConfig();
  const { deployProjectes } = await prompt({
    type: "list",
    name: "deployProjectes",
    message: "请选择需要部署的项目",
    choices: projectes.concat(nonMainLineBranches).map((v) => ({
      name: v,
      value: v
    }))
  });
  if (!deployProjectes) {
    console.log(chalk.red(`请选择要部署的项目`));
    kill$1(process.pid);
  }
  let deployBranch = branchName || "";
  if (!branchName) {
    const config = await prompt({
      type: "list",
      name: "deployBranch",
      message: "请选择需要部署的分支",
      choices: branches.map((v) => ({
        name: v,
        value: v
      }))
    });
    deployBranch = config.deployBranch;
  }
  const serverConfig = server[deployBranch] || {};
  if (!onlyBuild && (!serverConfig || !serverConfig.host || !serverConfig.serverFolder)) {
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
          checked: false
        };
      })
    )
  });
  return {
    selectProjectes: selectProjectes.includes("all") ? allProjects.filter((v) => !nonMainLineBranches.includes(v)) : selectProjectes
  };
};
program.command("b").argument("[branch]").option("-p", "跳过build").option("-n, --notCheck", "不校验版本").description("只构建").action(async (branch, options) => {
  await checkVersion(prompt, options.notCheck);
  const p = options.passBuild || process.argv.includes("-p");
  const { folder } = getConfig();
  if (!folder) {
    console.log(chalk.red(`请使用[hd-bs init <dir>]进行设置`));
    kill$1(process.pid);
    return;
  }
  await execAsync(`docker info`, "请先安装并启动docker");
  const { deployConfig } = await getDeployConfig(p, true, branch);
  console.log(
    chalk.green(`所选配置项: ${JSON.stringify(deployConfig, null, 2)}`)
  );
  await handleBuild(deployConfig);
});
program.command("bs").option("-p", "跳过build").option("-n, --notCheck", "不校验版本").description("构建并且部署").action(async (options) => {
  await checkVersion(prompt, options.notCheck);
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
program.command("d").argument("<tag>").option("-n, --notCheck", "不校验版本").description("只部署").action(async (tag, { notCheck }) => {
  await checkVersion(prompt, notCheck);
  const { deployConfig } = await getDeployConfig(false);
  await handleDeploy(deployConfig, tag);
});
program.command("m").option("-n, --notCheck", "不校验版本").description("只进行代码的拉取，合并(如果需要), 推送").action(async ({ notCheck }) => {
  await checkVersion(prompt, notCheck);
  const { deployConfig } = await getDeployConfig(false);
  await handleMerge(deployConfig, prompt);
});
program.command("branch").argument("<branch>").option("-f, --from <branch>", "指定来源分支").option("-n, --notCheck", "不校验版本").description("创建新分支").action(async (branch, options) => {
  await checkVersion(prompt, options.notCheck);
  if (!branch) {
    console.log(chalk.red("请输入分支名称"));
    kill$1(process.pid);
  }
  if (!(options == null ? void 0 : options.from)) {
    console.log(chalk.red("请使用 -f 或 --from 指定来源分支"));
    kill$1(process.pid);
  }
  await sleep(10);
  const { selectProjectes } = await getProjects();
  await createBranch({
    branch,
    from: options.from,
    selectProjectes
  });
});
program.command("merge").argument("<branch>").option("-f, --from <branch>", "指定来源分支").option("-n, --notCheck", "不校验版本").description("合并新分支").action(async (branch, options) => {
  await checkVersion(prompt, options.notCheck);
  if (!branch) {
    console.log(chalk.red("请输入分支名称"));
    kill$1(process.pid);
  }
  if (!options.from) {
    console.log(chalk.red("请使用 -f 或 --from 指定来源分支"));
    kill$1(process.pid);
  }
  await sleep(10);
  const { selectProjectes } = await getProjects();
  await mergeBranch({
    branch,
    from: options.from,
    selectProjectes
  });
});
program.command("tag").argument("<tag>").description("创建标签").option("-f, --from <branch>", "指定来源分支").option("-n, --notCheck", "不校验版本").action(async (tag, { from, notCheck }) => {
  await checkVersion(prompt, notCheck);
  if (!tag) {
    console.log(chalk.red("请输入标签名称"));
    kill$1(process.pid);
  }
  const { projectes, initProjectes, tagBranches, nonMainLineBranches } = getConfig();
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
        value: v
      }))
    });
    branch = res.branch;
  }
  const allProjects = [
    ...initProjectes,
    ...projectes,
    ...nonMainLineBranches
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
          checked: false
        };
      })
    )
  });
  createTags({
    tagProjects: tagProjects.includes("all") ? allProjects.filter((v) => !nonMainLineBranches.includes(v)) : tagProjects,
    tagName: tag,
    branch,
    isCustom: !!from
  });
});
program.command("u").option("-n, --notCheck", "不校验版本").description("统一修改项目中package.json的某一个配置").argument("<branch>", "统一修改的分支").action(async (branch, { notCheck }) => {
  await checkVersion(prompt, notCheck);
  if (!branch) {
    console.log(chalk.red("请输入分支名称"));
    kill$1(process.pid);
    return;
  }
  const { checkoutAll } = await prompt({
    type: "confirm",
    name: "checkoutAll",
    message: "此操作会放弃所有非新增的更改，是否继续？"
  });
  if (!checkoutAll) {
    kill$1(process.pid);
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
          checked: false
        };
      })
    )
  });
  const { editKey } = await prompt({
    type: "list",
    name: "editKey",
    choices: packageKeys.map((v) => ({
      name: v,
      value: v
    }))
  });
  if (!editKey) {
    console.log(chalk.red("请选择要修改的选项"));
    kill$1(process.pid);
    return;
  }
  const { newVal } = await prompt({
    type: "input",
    name: "newVal",
    message: "请输入新值"
  });
  updatePackage({
    projects: updateProjects.includes("all") ? allProjects : updateProjects,
    branch,
    editKey,
    newVal
  });
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
