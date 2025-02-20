import * as vscode from "vscode" // 导入 vscode 模块
import { userInfo } from "os" // 导入 os 模块中的 userInfo 函数
import { getShell } from "../shell" // 导入 getShell 函数

describe("Shell Detection Tests", () => {
	// 描述 "Shell Detection Tests" 测试套件
	let originalPlatform: string // 定义变量 originalPlatform
	let originalEnv: NodeJS.ProcessEnv // 定义变量 originalEnv
	let originalGetConfig: any // 定义变量 originalGetConfig
	let originalUserInfo: any // 定义变量 originalUserInfo

	// 辅助函数，用于模拟 VS Code 配置
	function mockVsCodeConfig(platformKey: string, defaultProfileName: string | null, profiles: Record<string, any>) {
		vscode.workspace.getConfiguration = () =>
			({
				get: (key: string) => {
					if (key === `defaultProfile.${platformKey}`) {
						return defaultProfileName
					}
					if (key === `profiles.${platformKey}`) {
						return profiles
					}
					return undefined
				},
			}) as any
	}

	beforeEach(() => {
		// 在每个测试之前执行
		// 存储原始引用
		originalPlatform = process.platform
		originalEnv = { ...process.env }
		originalGetConfig = vscode.workspace.getConfiguration
		originalUserInfo = userInfo

		// 清除环境变量以进行干净的测试
		delete process.env.SHELL
		delete process.env.COMSPEC

		// 默认的 userInfo() 模拟
		;(userInfo as any) = () => ({ shell: null })
	})

	afterEach(() => {
		// 在每个测试之后执行
		// 恢复所有内容
		Object.defineProperty(process, "platform", { value: originalPlatform })
		process.env = originalEnv
		vscode.workspace.getConfiguration = originalGetConfig
		;(userInfo as any) = originalUserInfo
	})

	// --------------------------------------------------------------------------
	// Windows Shell 检测
	// --------------------------------------------------------------------------
	describe("Windows Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "win32" })
		})

		it("uses explicit PowerShell 7 path from VS Code config (profile path)", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" },
			})
			expect(getShell()).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		})

		it("uses PowerShell 7 path if source is 'PowerShell' but no explicit path", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: { source: "PowerShell" },
			})
			expect(getShell()).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		})

		it("falls back to legacy PowerShell if profile includes 'powershell' but no path/source", () => {
			mockVsCodeConfig("windows", "PowerShell", {
				PowerShell: {},
			})
			expect(getShell()).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
		})

		it("uses WSL bash when profile indicates WSL source", () => {
			mockVsCodeConfig("windows", "WSL", {
				WSL: { source: "WSL" },
			})
			expect(getShell()).toBe("/bin/bash")
		})

		it("uses WSL bash when profile name includes 'wsl'", () => {
			mockVsCodeConfig("windows", "Ubuntu WSL", {
				"Ubuntu WSL": {},
			})
			expect(getShell()).toBe("/bin/bash")
		})

		it("defaults to cmd.exe if no special profile is matched", () => {
			mockVsCodeConfig("windows", "CommandPrompt", {
				CommandPrompt: {},
			})
			expect(getShell()).toBe("C:\\Windows\\System32\\cmd.exe")
		})

		it("handles undefined profile gracefully", () => {
			// 模拟一种情况，其中 defaultProfileName 存在但配置文件不存在
			mockVsCodeConfig("windows", "NonexistentProfile", {})
			expect(getShell()).toBe("C:\\Windows\\System32\\cmd.exe")
		})

		it("respects userInfo() if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			;(userInfo as any) = () => ({ shell: "C:\\Custom\\PowerShell.exe" })

			expect(getShell()).toBe("C:\\Custom\\PowerShell.exe")
		})

		it("respects an odd COMSPEC if no userInfo shell is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.COMSPEC = "D:\\CustomCmd\\cmd.exe"

			expect(getShell()).toBe("D:\\CustomCmd\\cmd.exe")
		})
	})

	// --------------------------------------------------------------------------
	// macOS Shell 检测
	// --------------------------------------------------------------------------
	describe("macOS Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "darwin" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("osx", "MyCustomShell", {
				MyCustomShell: { path: "/usr/local/bin/fish" },
			})
			expect(getShell()).toBe("/usr/local/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			;(userInfo as any) = () => ({ shell: "/opt/homebrew/bin/zsh" })
			expect(getShell()).toBe("/opt/homebrew/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.SHELL = "/usr/local/bin/zsh"
			expect(getShell()).toBe("/usr/local/bin/zsh")
		})

		it("falls back to /bin/zsh if no config, userInfo, or env variable is set", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			expect(getShell()).toBe("/bin/zsh")
		})
	})

	// --------------------------------------------------------------------------
	// Linux Shell 检测
	// --------------------------------------------------------------------------
	describe("Linux Shell Detection", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", { value: "linux" })
		})

		it("uses VS Code profile path if available", () => {
			mockVsCodeConfig("linux", "CustomProfile", {
				CustomProfile: { path: "/usr/bin/fish" },
			})
			expect(getShell()).toBe("/usr/bin/fish")
		})

		it("falls back to userInfo().shell if no VS Code config is available", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			;(userInfo as any) = () => ({ shell: "/usr/bin/zsh" })
			expect(getShell()).toBe("/usr/bin/zsh")
		})

		it("falls back to SHELL env var if no userInfo shell is found", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			process.env.SHELL = "/usr/bin/fish"
			expect(getShell()).toBe("/usr/bin/fish")
		})

		it("falls back to /bin/bash if nothing is set", () => {
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			expect(getShell()).toBe("/bin/bash")
		})
	})

	// --------------------------------------------------------------------------
	// 未知平台和错误处理
	// --------------------------------------------------------------------------
	describe("Unknown Platform / Error Handling", () => {
		it("falls back to /bin/sh for unknown platforms", () => {
			Object.defineProperty(process, "platform", { value: "sunos" })
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			expect(getShell()).toBe("/bin/sh")
		})

		it("handles VS Code config errors gracefully, falling back to userInfo shell if present", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = () => {
				throw new Error("Configuration error")
			}
			;(userInfo as any) = () => ({ shell: "/bin/bash" })
			expect(getShell()).toBe("/bin/bash")
		})

		it("handles userInfo errors gracefully, falling back to environment variable if present", () => {
			Object.defineProperty(process, "platform", { value: "darwin" })
			vscode.workspace.getConfiguration = () => ({ get: () => undefined }) as any
			;(userInfo as any) = () => {
				throw new Error("userInfo error")
			}
			process.env.SHELL = "/bin/zsh"
			expect(getShell()).toBe("/bin/zsh")
		})

		it("falls back fully to default shell paths if everything fails", () => {
			Object.defineProperty(process, "platform", { value: "linux" })
			vscode.workspace.getConfiguration = () => {
				throw new Error("Configuration error")
			}
			;(userInfo as any) = () => {
				throw new Error("userInfo error")
			}
			delete process.env.SHELL
			expect(getShell()).toBe("/bin/bash")
		})
	})
})
