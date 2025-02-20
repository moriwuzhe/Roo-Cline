import * as vscode from "vscode" // 导入 VSCode API
import { userInfo } from "os" // 导入 os 模块中的 userInfo 函数

const SHELL_PATHS = {
	// Windows 路径
	POWERSHELL_7: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
	POWERSHELL_LEGACY: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
	CMD: "C:\\Windows\\System32\\cmd.exe",
	WSL_BASH: "/bin/bash",
	// Unix 路径
	MAC_DEFAULT: "/bin/zsh",
	LINUX_DEFAULT: "/bin/bash",
	CSH: "/bin/csh",
	BASH: "/bin/bash",
	KSH: "/bin/ksh",
	SH: "/bin/sh",
	ZSH: "/bin/zsh",
	DASH: "/bin/dash",
	TCSH: "/bin/tcsh",
	FALLBACK: "/bin/sh",
} as const // 定义常量 SHELL_PATHS，包含各种操作系统的默认 shell 路径

interface MacTerminalProfile {
	path?: string // macOS 终端配置文件接口
}

type MacTerminalProfiles = Record<string, MacTerminalProfile> // macOS 终端配置文件类型

interface WindowsTerminalProfile {
	path?: string // Windows 终端配置文件接口
	source?: "PowerShell" | "WSL" // 终端来源
}

type WindowsTerminalProfiles = Record<string, WindowsTerminalProfile> // Windows 终端配置文件类型

interface LinuxTerminalProfile {
	path?: string // Linux 终端配置文件接口
}

type LinuxTerminalProfiles = Record<string, LinuxTerminalProfile> // Linux 终端配置文件类型

// -----------------------------------------------------
// 1) VS Code 终端配置助手
// -----------------------------------------------------

function getWindowsTerminalConfig() {
	try {
		const config = vscode.workspace.getConfiguration("terminal.integrated") // 获取 VSCode 终端配置
		const defaultProfileName = config.get<string>("defaultProfile.windows") // 获取默认配置文件名称
		const profiles = config.get<WindowsTerminalProfiles>("profiles.windows") || {} // 获取配置文件
		return { defaultProfileName, profiles } // 返回默认配置文件名称和配置文件
	} catch {
		return { defaultProfileName: null, profiles: {} as WindowsTerminalProfiles } // 捕获错误并返回默认值
	}
}

function getMacTerminalConfig() {
	try {
		const config = vscode.workspace.getConfiguration("terminal.integrated") // 获取 VSCode 终端配置
		const defaultProfileName = config.get<string>("defaultProfile.osx") // 获取默认配置文件名称
		const profiles = config.get<MacTerminalProfiles>("profiles.osx") || {} // 获取配置文件
		return { defaultProfileName, profiles } // 返回默认配置文件名称和配置文件
	} catch {
		return { defaultProfileName: null, profiles: {} as MacTerminalProfiles } // 捕获错误并返回默认值
	}
}

function getLinuxTerminalConfig() {
	try {
		const config = vscode.workspace.getConfiguration("terminal.integrated") // 获取 VSCode 终端配置
		const defaultProfileName = config.get<string>("defaultProfile.linux") // 获取默认配置文件名称
		const profiles = config.get<LinuxTerminalProfiles>("profiles.linux") || {} // 获取配置文件
		return { defaultProfileName, profiles } // 返回默认配置文件名称和配置文件
	} catch {
		return { defaultProfileName: null, profiles: {} as LinuxTerminalProfiles } // 捕获错误并返回默认值
	}
}

// -----------------------------------------------------
// 2) 平台特定的 VS Code Shell 检索
// -----------------------------------------------------

/** 尝试从 VS Code 配置中检索 Windows 上的 shell 路径。 */
function getWindowsShellFromVSCode(): string | null {
	const { defaultProfileName, profiles } = getWindowsTerminalConfig() // 获取 Windows 终端配置
	if (!defaultProfileName) {
		return null // 如果没有默认配置文件名称，则返回 null
	}

	const profile = profiles[defaultProfileName] // 获取默认配置文件

	// 如果配置文件名称指示 PowerShell，则进行版本检测。
	// 在测试中发现这些通常没有路径，此实现能够推断出正确的 PowerShell 版本
	if (defaultProfileName.toLowerCase().includes("powershell")) {
		if (profile?.path) {
			// 如果有明确的 PowerShell 路径，则返回该路径
			return profile.path
		} else if (profile?.source === "PowerShell") {
			// 如果配置文件来源于 PowerShell，则假设是最新版本
			return SHELL_PATHS.POWERSHELL_7
		}
		// 否则，假设是旧版 Windows PowerShell
		return SHELL_PATHS.POWERSHELL_LEGACY
	}

	// 如果有特定路径，则立即返回该路径
	if (profile?.path) {
		return profile.path
	}

	// 如果配置文件指示 WSL
	if (profile?.source === "WSL" || defaultProfileName.toLowerCase().includes("wsl")) {
		return SHELL_PATHS.WSL_BASH
	}

	// 如果没有检测到特殊情况，则假设是 cmd
	return SHELL_PATHS.CMD
}

/** 尝试从 VS Code 配置中检索 macOS 上的 shell 路径。 */
function getMacShellFromVSCode(): string | null {
	const { defaultProfileName, profiles } = getMacTerminalConfig() // 获取 macOS 终端配置
	if (!defaultProfileName) {
		return null // 如果没有默认配置文件名称，则返回 null
	}

	const profile = profiles[defaultProfileName] // 获取默认配置文件
	return profile?.path || null // 返回配置文件路径或 null
}

/** 尝试从 VS Code 配置中检索 Linux 上的 shell 路径。 */
function getLinuxShellFromVSCode(): string | null {
	const { defaultProfileName, profiles } = getLinuxTerminalConfig() // 获取 Linux 终端配置
	if (!defaultProfileName) {
		return null // 如果没有默认配置文件名称，则返回 null
	}

	const profile = profiles[defaultProfileName] // 获取默认配置文件
	return profile?.path || null // 返回配置文件路径或 null
}

// -----------------------------------------------------
// 3) 通用回退助手
// -----------------------------------------------------

/**
 * 尝试从 os.userInfo() 获取用户的 shell（如果底层系统调用支持，则在 Unix 上有效）。
 * 如果出错或未找到，则返回 null。
 */
function getShellFromUserInfo(): string | null {
	try {
		const { shell } = userInfo() // 获取用户信息中的 shell
		return shell || null // 返回 shell 或 null
	} catch {
		return null // 捕获错误并返回 null
	}
}

/** 返回基于环境的 shell 变量，如果未设置则返回 null。 */
function getShellFromEnv(): string | null {
	const { env } = process // 获取进程环境变量

	if (process.platform === "win32") {
		// 在 Windows 上，COMSPEC 通常包含 cmd.exe
		return env.COMSPEC || "C:\\Windows\\System32\\cmd.exe"
	}

	if (process.platform === "darwin") {
		// 在 macOS/Linux 上，SHELL 通常是环境变量
		return env.SHELL || "/bin/zsh"
	}

	if (process.platform === "linux") {
		// 在 Linux 上，SHELL 通常是环境变量
		return env.SHELL || "/bin/bash"
	}
	return null // 如果未匹配到平台，则返回 null
}

// -----------------------------------------------------
// 4) 公开的 Shell 获取函数
// -----------------------------------------------------

export function getShell(): string {
	// 1. 首先检查 VS Code 配置。
	if (process.platform === "win32") {
		// Windows 的特殊逻辑
		const windowsShell = getWindowsShellFromVSCode()
		if (windowsShell) {
			return windowsShell
		}
	} else if (process.platform === "darwin") {
		// macOS 从 VS Code 获取
		const macShell = getMacShellFromVSCode()
		if (macShell) {
			return macShell
		}
	} else if (process.platform === "linux") {
		// Linux 从 VS Code 获取
		const linuxShell = getLinuxShellFromVSCode()
		if (linuxShell) {
			return linuxShell
		}
	}

	// 2. 如果没有从 VS Code 获取到 shell，尝试 userInfo()
	const userInfoShell = getShellFromUserInfo()
	if (userInfoShell) {
		return userInfoShell
	}

	// 3. 如果仍然没有，尝试环境变量
	const envShell = getShellFromEnv()
	if (envShell) {
		return envShell
	}

	// 4. 最后，回退到默认值
	if (process.platform === "win32") {
		// 在 Windows 上，如果到这里，我们没有配置，没有 COMSPEC，并且操作系统非常混乱。
		// 使用 CMD 作为最后的手段
		return SHELL_PATHS.CMD
	}
	// 在 macOS/Linux 上，回退到 POSIX shell - 这是我们旧的 shell 检测方法的行为。
	return SHELL_PATHS.FALLBACK
}
