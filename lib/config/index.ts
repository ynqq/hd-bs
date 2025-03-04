import chalk from "chalk";
import fs from "node:fs";
import path from "path";
import rc from "rc";
import os from "os";
const userHome = os.homedir();
const npmrcFilePath = path.join(userHome!, ".HDDepolyrc");
export const getRCPath = () => npmrcFilePath;
/**rc文件配置 */
export interface IRCConfigs {
  /**会遍历该文件夹下的所有文件夹 进行打包、发布---建议将所有项目重新拉一下单独放在某个文件夹下 */
  folder: string;
  /**打包命令 默认为: build */
  buildCommand: string;
  /**需要打包的分支 */
  branches: string[];
  /**服务配置 */
  server: Record<
    string,
    {
      /**需要部署的服务器地址 */
      host: string;
      /**服务器上docker的文件夹 */
      serverFolder: string;
    }
  >;
  serverConfig: Record<
    string,
    {
      username: string;
      password: string;
      sudoPassword: string;
      dockerDir: string;
    }
  >;
  /**test分支 需要合并的分支名 */
  mergeToTestBranch: string;
  /**默认的子仓库 */
  submodule?: string;
  /**如果这里面没有配置子仓库，就使用默认的子仓库，如果都没设置就不处理 */
  projectSubModule?: Record<string, string>;
  /**仓库名称 */
  origin: string;
  /**镜像仓库地址 */
  image_name_remote: string;
  /**初始化时需要包含的项目 */
  initProjectes: string[];
  /**git仓库地址 不包含项目 */
  gitPrefix: string;
  /**包含的项目 */
  projectes: string[];
}

/**
 * 获取rc配置
 * @returns config {@link IRCConfigs}
 */
export const getConfig = (): IRCConfigs => {
  const config = rc<IRCConfigs>("HDDepoly", {
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
    serverConfig: {},
  });
  return config;
};

/**
 * 设置rc配置
 * @param config Record<string, any>
 */
export const setConfig = (config: Record<string, any>) => {
  const oldConfig = getConfig();
  const configString = { ...oldConfig, ...config };
  fs.writeFileSync(
    npmrcFilePath,
    JSON.stringify(configString, null, 2),
    "utf-8"
  );
  console.log(chalk.green("设置成功"));
};

/**
 * 设置需要部署的分支
 * @param newBranch
 * @param type
 */
export const setBranches = (
  newBranch: string,
  type: 0 | 1,
  serverHost?: string,
  serverFolder?: string
) => {
  const oldConfig = getConfig();
  const branches = oldConfig.branches;
  const newBranches =
    type === 0
      ? [...branches, newBranch]
      : branches.filter((v) => v !== newBranch);
  const server = oldConfig.server;
  if (type === 0) {
    Object.assign(server, {
      [newBranch]: {
        host: serverHost,
        serverFolder: serverFolder,
      },
    });
  }

  const configString = {
    ...oldConfig,
    server,
    branches: Array.from(new Set(newBranches)),
  };
  fs.writeFileSync(
    npmrcFilePath,
    JSON.stringify(configString, null, 2),
    "utf-8"
  );
  console.log(chalk.green(type === 0 ? "新增成功" : "删除成功"));
};
