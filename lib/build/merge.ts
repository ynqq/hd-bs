import path from "node:path";
import { getConfig } from "../config";
import { execAsync, sleep } from "../util";
import chalk from "chalk";
import fs from "node:fs";
import { execSync } from "node:child_process";
import dayjs from "dayjs";
import { createOra } from "../ora";
import { RunGitOptions } from "./types";

interface IPubOptions {
  projectPath: string;
  folderPath: string;
  project: string;
}

const LOCK_DOCKERFILE_NAME = `lock.Dockerfile`;

export const handleMergeBranch = async (
  project: RunGitOptions["deployProjectes"],
  branch: string,
  folderPath: string
) => {
  const {
    submodule,
    projectSubModule = {},
    mergeToTestBranch,
    origin,
  } = getConfig();
  const sp = createOra("正在拉取最新代码");
  if (branch === "test" && mergeToTestBranch) {
    // test 需要进行合并
    const submoduleFolderName = projectSubModule[project] || submodule;
    if (submoduleFolderName) {
      // 需要合并 并且 有子项目需要合并
      const commands = [
        `cd ${path.join(folderPath, `/${submoduleFolderName}`)}`,
        `git pull`,
        `git checkout ${branch}`,
        `git pull ${origin} ${branch}`,
        `git merge ${origin}/${mergeToTestBranch}`,
        `git push ${origin} ${branch}`,
      ];
      try {
        await execAsync(commands.join("&&"));
      } catch (error) {
        console.log(
          chalk.red(
            `${submoduleFolderName} ${mergeToTestBranch} -> test 合并失败`
          )
        );
      }
    }
    const commands = [
      `cd ${path.join(folderPath, `/${project}`)}`,
      `git pull`,
      `git checkout ${branch}`,
      `git pull ${origin} ${mergeToTestBranch}`,
      `git merge ${origin}/${mergeToTestBranch}`,
      `git push ${origin} ${branch}`,
    ];
    try {
      await execAsync(commands.join("&&"));
    } catch (error) {
      console.log(
        chalk.red(`${project} ${mergeToTestBranch} -> test 合并失败`)
      );
    }
  } else {
    const commands = [
      `cd ${path.join(folderPath, `/${project}`)}`,
      `git checkout ${branch}`,
      `git pull ${origin} ${branch}`,
    ];
    await execAsync(commands.join("&&"));
  }

  sp.color = "green";
  sp.text = "合并完成";
  await sleep(300);
  sp.stop();
};

const getPkgConfig = async (
  item: RunGitOptions["deployProjectes"],
  folderPath: string
): Promise<Record<string, any> | null> => {
  const pkg = fs.readFileSync(
    path.join(folderPath, `/${item}/package.json`),
    "utf-8"
  );
  try {
    return JSON.parse(pkg);
  } catch (error) {
    return null;
  }
};

const setSubmodule = async (
  project: string,
  branch: string,
  folderPath: string
) => {
  const sp = createOra("正在初始化子仓库");
  const gitmodules_file = ".gitmodules";
  const filePath = path.join(folderPath, `/${project}/${gitmodules_file}`);
  const fileData = fs.readFileSync(filePath, "utf-8");
  fs.writeFileSync(
    filePath,
    fileData.replace(/(branch\s+=).*(\n)/, `$1${branch}$2`)
  );
  const commands = [
    `cd ${path.join(folderPath, `/${project}`)}`,
    "git submodule deinit -f --all",
  ];
  await execAsync(commands.join("&&"));

  fs.rmSync(
    path.join(`${path.join(folderPath, `/${project}`)}`, ".git/modules"),
    {
      recursive: true,
      force: true,
    }
  );
  await execAsync(
    [
      `cd ${path.join(folderPath, `/${project}`)}`,
      "git submodule init",
      "git submodule update --remote",
    ].join("&&")
  );
  sp.text = "子仓库初始化完成";
  sp.color = "green";
  await sleep(300);
  sp.stop();
};

const genLogFile = async (
  { projectVersion, name }: Record<string, any>,
  item: string,
  folderPath: string
) => {
  const sp = createOra("正在生成version文件");
  const cdCommand = `${path.join(folderPath, `/${item}`)}`;
  const version = projectVersion;
  const imageName = `local/vue/${name.slice(8)}`;
  const branch = execSync(`cd ${cdCommand} && git rev-parse --abbrev-ref HEAD`)
    .toString()
    .trim();
  const buildUserName = execSync(`cd ${cdCommand} && git show -s --format=%cn`)
    .toString()
    .trim();
  const buildTime = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const gitLog = execSync(
    `cd ${cdCommand} && git log -6 --date=format:"%Y-%m-%d %H:%M:%S" --pretty=format:"提交人：%an <br> 提交时间：%ad <div>提交信息：%s</div><br>"`
  )
    .toString()
    .trim()
    .replace(/\n/g, "");

  const gitCoreLog = execSync(
    `cd ${cdCommand} && git submodule foreach git log -6 --date=format:"%Y-%m-%d %H:%M:%S" --pretty=format:"提交人：%an <br> 提交时间：%ad <div>提交信息：%s</div><br>"`
  )
    .toString()
    .trim()
    .replace(/\n/g, "")
    .replace(/Entering '(plm-vue-)?core'/, "");

  const content = `{
  "branch": "${branch}",
  "tag": "${branch}.${version}.${String(Date.now()).slice(-4)}",
  "imageName": "${imageName}",
  "buildUserName": "${buildUserName}",
  "buildTime": "${buildTime}",
  "gitLog": "${gitLog}",
  "gitCoreLog": "${gitCoreLog}"
}
`;

  fs.writeFileSync(
    path.join(folderPath, `/${item}/public/version.json`),
    content
  );
  sp.text = "version文件生成成功";
  sp.color = "green";
  await sleep(300);
  sp.stop();
  return JSON.parse(content);
};

const buildDockerImg = async (
  tag: string,
  imageName: string,
  folderPath: string,
  item: string
) => {
  const { image_name_remote } = getConfig();
  const project = item.replace(/plm-vue-(.*)/, "$1");
  let new_image_name_remote = `${image_name_remote}${project}`;
  const commands = [
    `cd ${path.join(folderPath, `/${item}`)}`,
    `docker build -f ${LOCK_DOCKERFILE_NAME} -t ${imageName}:${tag} .`,
    `docker tag ${imageName}:${tag} ${new_image_name_remote}:${tag}`,
    `docker push ${new_image_name_remote}:${tag}`,
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

const runBuild = async (folderPath: string, item: string) => {
  const { buildCommand } = getConfig();
  const commands = [
    `cd ${path.join(folderPath, `/${item}`)}`,
    `npm config set registry  https://registry.npmmirror.com`,
    `npm i --force`,
    `npm run ${buildCommand}`,
  ];
  const sp = createOra("正在执行构建命令");
  await execAsync(commands.join("&&"), "构建失败", {
    env: process.env,
  });
  sp.text = "构建成功";
  sp.color = "green";
  await sleep(300);
  sp.stop();
};

const initProject = async ({
  project,
  projectPath,
  folderPath,
}: IPubOptions) => {
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

const createLocalDockerfile = async (
  { projectPath }: IPubOptions,
  thirdPartyUrl: string
) => {
  const p = path.join(projectPath, LOCK_DOCKERFILE_NAME);
  const ignoreFile = path.join(projectPath, ".dockerignore");
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

export const handleBuild = async (options: RunGitOptions) => {
  const { deployProjectes, branch, folderPath, passBuild } = options;
  const project = deployProjectes;
  const projectPath = path.join(folderPath, project);
  const pubOptions: IPubOptions = {
    projectPath,
    folderPath,
    project,
  };
  await initProject(pubOptions);
  try {
    if (!passBuild) {
      handleMergeBranch(project, branch, folderPath);
    }
  } catch (error) {
    console.log(error);
  }
  const pkg = await getPkgConfig(project, folderPath);
  if (pkg) {
    const { projectVersion, thirdPartyUrl } = pkg;
    await createLocalDockerfile(pubOptions, thirdPartyUrl);
    const random_number = [...new Array(4)]
      .map(() => (Math.random() * 10) | 0)
      .join("");

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
