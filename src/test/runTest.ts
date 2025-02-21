import * as path from "path"
import { runTests } from "@vscode/test-electron"

// 主函数，运行测试
async function main() {
	try {
		// 扩展开发路径，传递给 `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, "../../")

		// 扩展测试脚本路径，传递给 --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, "./suite/index")

		// 下载 VS Code，解压并运行集成测试
		await runTests({ extensionDevelopmentPath, extensionTestsPath })
	} catch {
		console.error("Failed to run tests") // 如果运行测试失败，输出错误信息
		process.exit(1) // 退出进程并返回错误码
	}
}

main() // 调用主函数
