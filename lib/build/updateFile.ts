import { join } from "path";
import { getConfig } from "../config";
import { checkProjectDir, execAsync, getGitStatus } from "../util";
import { readFileSync, writeFileSync } from "fs";
import { createOra } from "../ora";

export const updatePackage = async (options: {
  projects: string[];
  branch: string;
  newVal: string;
  editKey: string;
}) => {
  const { projects, branch, editKey, newVal } = options;
  const { folder, origin } = getConfig();
  await checkProjectDir(projects, branch);
  const sp = createOra("开始修改");
  for (const project of projects) {
    const filePath = join(folder, project, "/package.json");
    const reg = new RegExp(`("${editKey}":\\s+").+(",?\n?)`);
    const str = readFileSync(filePath, "utf-8").replace(reg, `$1${newVal}$2`);
    writeFileSync(filePath, str);
    const files = getGitStatus(join(folder, project));
    if ((await files).some((v) => v.file === "package.json")) {
      sp.text = `${project}修改完成,正在进行提交`;
      const commonds = [
        `git add package.json`,
        `git commit -m "chore: 修改package.json ${editKey}==>${newVal}"`,
        `git push ${origin} ${branch}`,
      ];
      await execAsync(commonds, "", { cwd: join(folder, project) });
      sp.succeed(`${project}修改并提交完成`);
    } else {
      sp.succeed(`${project}无需修改`);
    }
  }
  sp.succeed(`已将所有项目package.json中${editKey}的值改为${newVal}`);
};
