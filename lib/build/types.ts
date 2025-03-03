export interface RunGitOptions {
  /**部署服务器ip */
  host: string;
  /**部署分支 */
  branch: string;
  /**服务器上面对应的文件夹 */
  serverFolder: string;
  /**部署的项目 */
  deployProjectes: string;
  folderPath: string;
  /**是否跳过本地build */
  passBuild: boolean;
}
