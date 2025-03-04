import { kill } from "process";
import { getConfig } from "../config";
import { RunGitOptions } from "./types";
import { Client } from "ssh2";
import chalk from "chalk";

export const handleDeploy = async (
  deployConfig: RunGitOptions,
  tag: string
) => {
  const { serverConfig, image_name_remote } = getConfig();
  const hostConfig = serverConfig[deployConfig.host];
  if (!hostConfig) {
    console.log(chalk.red(`请设置${deployConfig.host}的服务器用户名和密码`));
    kill(process.pid);
  }
  const { username, password, sudoPassword, dockerDir } = hostConfig;
  const config = {
    host: deployConfig.host,
    port: 22,
    username: username,
    password: password,
  };
  const project = deployConfig.deployProjectes.replace(/plm-vue-(.*)/, "$1");
  const envTag = tag.replace(`${image_name_remote}${project}:`, "");
  const envKey = `vue_${project}_tag`;
  const { serverFolder } = deployConfig;
  const commands = `cd ${dockerDir}/${serverFolder}/ && \
    echo '${sudoPassword}' | sudo -S sed -i  "s/${envKey}=.*/${envKey}=${envTag}/g" .env && \
    echo '${sudoPassword}' | sudo -S docker-compose build && \
    echo '${sudoPassword}' | sudo -S docker-compose stop web && \
    echo '${sudoPassword}' | sudo -S docker-compose up -d web`;
  const conn = new Client();
  conn
    .on("ready", () => {
      console.log(chalk.green("连接成功"));
      conn.exec(commands, (err, stream) => {
        if (err) {
          console.log(chalk.red("执行报错"));
          kill(process.pid);
          return;
        }
        stream
          .on("close", () => {
            console.log(chalk.green(`${deployConfig.deployProjectes}部署完成`));
            conn.end();
          })
          .on("data", (data: any) => {
            console.log(`STDOUT: ${data}`);
          })
          .stderr.on("data", (data) => {
            console.log(`STDERR: ${data}`);
          });
      });
    })
    .connect(config);
};
