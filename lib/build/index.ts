import chalk from "chalk";
import { spawn } from "child_process";
import { kill } from "process";
import { getConfig } from "../config";

export const runBuild = (p: string) => {
  return new Promise<void>((resolve, reject) => {
    const buildCommond = getConfig().buildCommand;
    console.log("sh", ["-c", `cd ${p} && npm run ${buildCommond}`]);

    const sp = spawn(
      "bash",
      [
        "-c",
        `cd ${p} && npm config set registry  https://registry.npmmirror.com && npm i --force && npm run ${buildCommond}`,
      ],
      {
        stdio: "inherit",
        shell: true,
        env: process.env,
      }
    );
    sp.on("error", (error) => {
      kill(process.pid);
      console.log(chalk.red("打包出错"));
      reject(error);
    });
    sp.on("close", (code) => {
      if (code !== 0) {
        console.log(chalk.red("打包出错"));
        reject();
        kill(process.pid);
        return;
      }
      console.log(chalk.green("打包完成"));
      resolve();
    });
  });
};
