import * as vscode from "vscode" // 导入 VS Code API

/*
用于获取用户当前的 Python 环境（现在使用 IDE 的终端不再需要）
${await (async () => {
		try {
			const pythonEnvPath = await getPythonEnvPath()
			if (pythonEnvPath) {
				return `\nPython Environment: ${pythonEnvPath}`
			}
		} catch {}
		return ""
	})()}
*/
export async function getPythonEnvPath(): Promise<string | undefined> {
	const pythonExtension = vscode.extensions.getExtension("ms-python.python") // 获取 Python 扩展

	if (!pythonExtension) {
		return undefined // 如果没有安装 Python 扩展，返回 undefined
	}

	// 确保 Python 扩展已激活
	if (!pythonExtension.isActive) {
		// 如果 Python 扩展未激活，可以假设该项目不是 Python 项目
		return undefined
	}

	// 访问 Python 扩展 API
	const pythonApi = pythonExtension.exports
	// 获取当前工作区的活动环境路径
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
	if (!workspaceFolder) {
		return undefined // 如果没有工作区文件夹，返回 undefined
	}
	// 获取当前工作区的活动 Python 环境路径
	const pythonEnv = await pythonApi?.environments?.getActiveEnvironmentPath(workspaceFolder.uri)
	if (pythonEnv && pythonEnv.path) {
		return pythonEnv.path // 返回 Python 环境路径
	} else {
		return undefined // 如果没有找到 Python 环境路径，返回 undefined
	}
}
