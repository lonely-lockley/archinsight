import { execFile } from "node:child_process";
import type { RenderTheme } from "@insight/language";
import type { ThemeOption } from "./cli-arguments.js";

export type ThemeCommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

export type ThemeCommandRunner = (
  executable: string,
  args: readonly string[],
) => Promise<ThemeCommandResult>;

export async function resolveRenderTheme(
  option: ThemeOption | undefined,
  detector: () => Promise<RenderTheme | undefined> = detectSystemRenderTheme,
): Promise<RenderTheme> {
  if (option === "light" || option === "dark") return option;
  try {
    return await detector() ?? "light";
  } catch {
    return "light";
  }
}

export async function detectSystemRenderTheme(
  platform = process.platform,
  run: ThemeCommandRunner = runThemeCommand,
): Promise<RenderTheme | undefined> {
  try {
    if (platform === "darwin") {
      const result = await run("defaults", ["read", "-g", "AppleInterfaceStyle"]);
      return result.stdout.trim().toLowerCase() === "dark" ? "dark" : "light";
    }
    if (platform === "win32") {
      const result = await run("reg.exe", [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        "/v",
        "AppsUseLightTheme",
      ]);
      return parseWindowsTheme(result.stdout);
    }
    if (platform === "linux") {
      const result = await run("gdbus", [
        "call",
        "--session",
        "--dest", "org.freedesktop.portal.Desktop",
        "--object-path", "/org/freedesktop/portal/desktop",
        "--method", "org.freedesktop.portal.Settings.ReadOne",
        "org.freedesktop.appearance",
        "color-scheme",
      ]);
      return parseLinuxTheme(result.stdout);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function parseWindowsTheme(output: string): RenderTheme | undefined {
  const value = /AppsUseLightTheme\s+REG_DWORD\s+0x([01])\b/i.exec(output)?.[1];
  return value === "0" ? "dark" : value === "1" ? "light" : undefined;
}

export function parseLinuxTheme(output: string): RenderTheme | undefined {
  const value = /uint32\s+([012])\b/i.exec(output)?.[1];
  return value === "1" ? "dark" : value === "2" ? "light" : undefined;
}

function runThemeCommand(executable: string, args: readonly string[]): Promise<ThemeCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      encoding: "utf8",
      timeout: 750,
      maxBuffer: 4096,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error !== null) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}
