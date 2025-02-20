import * as path from "path" // 导入路径模块
import os from "os" // 导入操作系统模块

/*
Node.js 的 'path' 模块根据平台不同以不同方式解析和规范化路径：
- 在 Windows 上，它使用反斜杠 (\) 作为默认路径分隔符。
- 在 POSIX 兼容系统（Linux、macOS）上，它使用正斜杠 (/) 作为默认路径分隔符。

虽然可以使用 'upath' 等模块来统一使用正斜杠，但这在与其他模块（如 vscode.fs）交互时可能会产生不一致，
因为这些模块在 Windows 上使用反斜杠。

我们的策略：
1. 我们向 AI 和用户展示使用正斜杠的路径以保持一致性。
2. 我们使用 'arePathsEqual' 函数进行安全的路径比较。
3. 在内部，Node.js 能够优雅地处理反斜杠和正斜杠。

这种策略确保了路径展示的一致性，同时利用了 Node.js 内置的跨平台路径处理能力。

注意：在与文件系统或 VS Code API 交互时，我们仍然使用原生路径模块以确保在所有平台上的正确行为。
toPosixPath 和 arePathsEqual 函数主要用于展示和比较目的，而不是实际的文件系统操作。

观察：
- macOS 对混合分隔符不太灵活，而 Windows 可以处理两者。（"Node.js 确实会自动处理 Windows 上的路径分隔符，根据需要将正斜杠转换为反斜杠。然而，在 macOS 和其他类 Unix 系统上，路径分隔符始终是正斜杠 (/)，反斜杠被视为普通字符。"）
*/

function toPosixPath(p: string) {
	// Windows 中的扩展长度路径以 "\\?\" 开头，允许更长的路径并绕过通常的解析。如果检测到，我们返回未修改的路径以保持功能，因为更改这些路径可能会破坏其特殊语法。
	const isExtendedLengthPath = p.startsWith("\\\\?\\")

	if (isExtendedLengthPath) {
		return p
	}

	return p.replace(/\\/g, "/") // 将反斜杠替换为正斜杠
}

// 声明合并允许我们向 String 类型添加新方法
// 必须在入口点（extension.ts）中导入此文件以在运行时访问
declare global {
	interface String {
		toPosix(): string
	}
}

String.prototype.toPosix = function (this: string): string {
	return toPosixPath(this) // 将字符串转换为 POSIX 路径
}

// 跨平台的安全路径比较
export function arePathsEqual(path1?: string, path2?: string): boolean {
	if (!path1 && !path2) {
		return true // 如果两个路径都为空，则返回 true
	}
	if (!path1 || !path2) {
		return false // 如果其中一个路径为空，则返回 false
	}

	path1 = normalizePath(path1) // 规范化路径1
	path2 = normalizePath(path2) // 规范化路径2

	if (process.platform === "win32") {
		return path1.toLowerCase() === path2.toLowerCase() // 在 Windows 上，忽略大小写进行比较
	}
	return path1 === path2 // 在其他平台上，直接比较
}

function normalizePath(p: string): string {
	// 规范化路径，解析 ./.. 段，删除重复的斜杠，并标准化路径分隔符
	let normalized = path.normalize(p)
	// 但是它不会删除尾部斜杠
	// 删除尾部斜杠，除了根路径
	if (normalized.length > 1 && (normalized.endsWith("/") || normalized.endsWith("\\"))) {
		normalized = normalized.slice(0, -1)
	}
	return normalized
}

export function getReadablePath(cwd: string, relPath?: string): string {
	relPath = relPath || ""
	// path.resolve 非常灵活，它会将相对路径（如 '../../'）解析为 cwd，并且如果 relPath 实际上是绝对路径，则忽略 cwd
	const absolutePath = path.resolve(cwd, relPath)
	if (arePathsEqual(cwd, path.join(os.homedir(), "Desktop"))) {
		// 用户在没有工作区的情况下打开 vscode，因此 cwd 是桌面。显示完整的绝对路径以使用户了解文件的创建位置
		return absolutePath.toPosix()
	}
	if (arePathsEqual(path.normalize(absolutePath), path.normalize(cwd))) {
		return path.basename(absolutePath).toPosix() // 返回路径的基本名称
	} else {
		// 显示相对于 cwd 的相对路径
		const normalizedRelPath = path.relative(cwd, absolutePath)
		if (absolutePath.includes(cwd)) {
			return normalizedRelPath.toPosix()
		} else {
			// 我们在 cwd 之外，因此显示绝对路径（例如，当 cline 传递 '../../' 时很有用）
			return absolutePath.toPosix()
		}
	}
}

export const toRelativePath = (filePath: string, cwd: string) => {
	const relativePath = path.relative(cwd, filePath).toPosix() // 获取相对路径并转换为 POSIX 路径
	return filePath.endsWith("/") ? relativePath + "/" : relativePath // 如果文件路径以斜杠结尾，则在相对路径后添加斜杠
}
