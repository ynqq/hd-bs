import ora, { Color } from "ora";

export const createOra = (text: string, color: Color = "yellow") => {
  const spinner = ora(text).start();
  spinner.color = color;
  return spinner;
};
