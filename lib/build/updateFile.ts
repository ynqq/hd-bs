import { join } from "path";
import { getConfig } from "../config";
import { checkProjectDir, execAsync } from "../util";
import { readFileSync, writeFileSync } from "fs";

export const updatePackage = async (options: {
  projects: string[];
  branch: string;
  newVal: string;
  editKey: string;
}) => {
  const { projects, branch, editKey, newVal } = options;
  const { folder, origin } = getConfig();
  await checkProjectDir(projects, branch);
  for (const project of projects) {
    const filePath = join(folder, project, "/package.json");
    const reg = new RegExp(`("${editKey}":\\s+").+(",?\n?)`);
    const str = readFileSync(filePath, "utf-8").replace(reg, `$1${newVal}$2`);
    writeFileSync(filePath, str);
    const commonds = [
      `git add package.json`,
      `git commit -m "chore: 修改package.json ${editKey}==>${newVal}"`,
      `git push ${origin} ${branch}`,
    ];
    await execAsync(commonds, "", { cwd: join(folder, project) });
  }
};
