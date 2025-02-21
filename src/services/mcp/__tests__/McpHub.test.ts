import type { McpHub as McpHubType } from "../McpHub" // 导入 McpHub 类型
import type { ClineProvider } from "../../../core/webview/ClineProvider" // 导入 ClineProvider 类型
import type { ExtensionContext, Uri } from "vscode" // 导入 VSCode 的 ExtensionContext 和 Uri 类型
import type { McpConnection } from "../McpHub" // 导入 McpConnection 类型
import { StdioConfigSchema } from "../McpHub" // 导入 StdioConfigSchema

const fs = require("fs/promises") // 导入 fs/promises 模块
const { McpHub } = require("../McpHub") // 导入 McpHub 模块

jest.mock("vscode") // 模拟 VSCode 模块
jest.mock("fs/promises") // 模拟 fs/promises 模块
jest.mock("../../../core/webview/ClineProvider") // 模拟 ClineProvider 模块

describe("McpHub", () => {
	let mcpHub: McpHubType // 定义 mcpHub 变量
	let mockProvider: Partial<ClineProvider> // 定义 mockProvider 变量
	const mockSettingsPath = "/mock/settings/path/cline_mcp_settings.json" // 定义 mockSettingsPath 变量

	beforeEach(() => {
		jest.clearAllMocks() // 清除所有模拟

		const mockUri: Uri = {
			scheme: "file",
			authority: "",
			path: "/test/path",
			query: "",
			fragment: "",
			fsPath: "/test/path",
			with: jest.fn(),
			toJSON: jest.fn(),
		} // 定义 mockUri 变量

		mockProvider = {
			ensureSettingsDirectoryExists: jest.fn().mockResolvedValue("/mock/settings/path"),
			ensureMcpServersDirectoryExists: jest.fn().mockResolvedValue("/mock/settings/path"),
			postMessageToWebview: jest.fn(),
			context: {
				subscriptions: [],
				workspaceState: {} as any,
				globalState: {} as any,
				secrets: {} as any,
				extensionUri: mockUri,
				extensionPath: "/test/path",
				storagePath: "/test/storage",
				globalStoragePath: "/test/global-storage",
				environmentVariableCollection: {} as any,
				extension: {
					id: "test-extension",
					extensionUri: mockUri,
					extensionPath: "/test/path",
					extensionKind: 1,
					isActive: true,
					packageJSON: {
						version: "1.0.0",
					},
					activate: jest.fn(),
					exports: undefined,
				} as any,
				asAbsolutePath: (path: string) => path,
				storageUri: mockUri,
				globalStorageUri: mockUri,
				logUri: mockUri,
				extensionMode: 1,
				logPath: "/test/path",
				languageModelAccessInformation: {} as any,
			} as ExtensionContext,
		} // 定义 mockProvider 变量

		// 模拟 fs.readFile 以获取初始设置
		;(fs.readFile as jest.Mock).mockResolvedValue(
			JSON.stringify({
				mcpServers: {
					"test-server": {
						command: "node",
						args: ["test.js"],
						alwaysAllow: ["allowed-tool"],
					},
				},
			}),
		)

		mcpHub = new McpHub(mockProvider as ClineProvider) // 初始化 mcpHub
	})

	describe("toggleToolAlwaysAllow", () => {
		it("should add tool to always allow list when enabling", async () => {
			const mockConfig = {
				mcpServers: {
					"test-server": {
						command: "node",
						args: ["test.js"],
						alwaysAllow: [],
					},
				},
			} // 定义 mockConfig 变量

			// 模拟读取初始配置
			;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

			await mcpHub.toggleToolAlwaysAllow("test-server", "new-tool", true) // 启用工具

			// 验证配置是否正确更新
			const writeCall = (fs.writeFile as jest.Mock).mock.calls[0]
			const writtenConfig = JSON.parse(writeCall[1])
			expect(writtenConfig.mcpServers["test-server"].alwaysAllow).toContain("new-tool")
		})

		it("should remove tool from always allow list when disabling", async () => {
			const mockConfig = {
				mcpServers: {
					"test-server": {
						command: "node",
						args: ["test.js"],
						alwaysAllow: ["existing-tool"],
					},
				},
			} // 定义 mockConfig 变量

			// 模拟读取初始配置
			;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

			await mcpHub.toggleToolAlwaysAllow("test-server", "existing-tool", false) // 禁用工具

			// 验证配置是否正确更新
			const writeCall = (fs.writeFile as jest.Mock).mock.calls[0]
			const writtenConfig = JSON.parse(writeCall[1])
			expect(writtenConfig.mcpServers["test-server"].alwaysAllow).not.toContain("existing-tool")
		})

		it("should initialize alwaysAllow if it does not exist", async () => {
			const mockConfig = {
				mcpServers: {
					"test-server": {
						command: "node",
						args: ["test.js"],
					},
				},
			} // 定义 mockConfig 变量

			// 模拟读取初始配置
			;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

			await mcpHub.toggleToolAlwaysAllow("test-server", "new-tool", true) // 启用工具

			// 验证配置是否正确更新并初始化 alwaysAllow
			const writeCall = (fs.writeFile as jest.Mock).mock.calls[0]
			const writtenConfig = JSON.parse(writeCall[1])
			expect(writtenConfig.mcpServers["test-server"].alwaysAllow).toBeDefined()
			expect(writtenConfig.mcpServers["test-server"].alwaysAllow).toContain("new-tool")
		})
	})

	describe("server disabled state", () => {
		it("should toggle server disabled state", async () => {
			const mockConfig = {
				mcpServers: {
					"test-server": {
						command: "node",
						args: ["test.js"],
						disabled: false,
					},
				},
			} // 定义 mockConfig 变量

			// 模拟读取初始配置
			;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

			await mcpHub.toggleServerDisabled("test-server", true) // 禁用服务器

			// 验证配置是否正确更新
			const writeCall = (fs.writeFile as jest.Mock).mock.calls[0]
			const writtenConfig = JSON.parse(writeCall[1])
			expect(writtenConfig.mcpServers["test-server"].disabled).toBe(true)
		})

		it("should filter out disabled servers from getServers", () => {
			const mockConnections: McpConnection[] = [
				{
					server: {
						name: "enabled-server",
						config: "{}",
						status: "connected",
						disabled: false,
					},
					client: {} as any,
					transport: {} as any,
				},
				{
					server: {
						name: "disabled-server",
						config: "{}",
						status: "connected",
						disabled: true,
					},
					client: {} as any,
					transport: {} as any,
				},
			] // 定义 mockConnections 变量

			mcpHub.connections = mockConnections
			const servers = mcpHub.getServers() // 获取启用的服务器

			expect(servers.length).toBe(1)
			expect(servers[0].name).toBe("enabled-server")
		})

		it("should prevent calling tools on disabled servers", async () => {
			const mockConnection: McpConnection = {
				server: {
					name: "disabled-server",
					config: "{}",
					status: "connected",
					disabled: true,
				},
				client: {
					request: jest.fn().mockResolvedValue({ result: "success" }),
				} as any,
				transport: {} as any,
			} // 定义 mockConnection 变量

			mcpHub.connections = [mockConnection]

			await expect(mcpHub.callTool("disabled-server", "some-tool", {})).rejects.toThrow(
				'Server "disabled-server" is disabled and cannot be used',
			) // 验证禁用服务器不能调用工具
		})

		it("should prevent reading resources from disabled servers", async () => {
			const mockConnection: McpConnection = {
				server: {
					name: "disabled-server",
					config: "{}",
					status: "connected",
					disabled: true,
				},
				client: {
					request: jest.fn(),
				} as any,
				transport: {} as any,
			} // 定义 mockConnection 变量

			mcpHub.connections = [mockConnection]

			await expect(mcpHub.readResource("disabled-server", "some/uri")).rejects.toThrow(
				'Server "disabled-server" is disabled',
			) // 验证禁用服务器不能读取资源
		})
	})

	describe("callTool", () => {
		it("should execute tool successfully", async () => {
			// 模拟连接，提供最小的客户端实现
			const mockConnection: McpConnection = {
				server: {
					name: "test-server",
					config: JSON.stringify({}),
					status: "connected" as const,
				},
				client: {
					request: jest.fn().mockResolvedValue({ result: "success" }),
				} as any,
				transport: {
					start: jest.fn(),
					close: jest.fn(),
					stderr: { on: jest.fn() },
				} as any,
			} // 定义 mockConnection 变量

			mcpHub.connections = [mockConnection]

			await mcpHub.callTool("test-server", "some-tool", {}) // 调用工具

			// 验证请求是否使用正确的参数
			expect(mockConnection.client.request).toHaveBeenCalledWith(
				{
					method: "tools/call",
					params: {
						name: "some-tool",
						arguments: {},
					},
				},
				expect.any(Object),
				expect.objectContaining({ timeout: 60000 }), // 默认 60 秒超时
			)
		})

		it("should throw error if server not found", async () => {
			await expect(mcpHub.callTool("non-existent-server", "some-tool", {})).rejects.toThrow(
				"No connection found for server: non-existent-server",
			) // 验证找不到服务器时抛出错误
		})

		describe("timeout configuration", () => {
			it("should validate timeout values", () => {
				// 测试有效的超时值
				const validConfig = {
					command: "test",
					timeout: 60,
				}
				expect(() => StdioConfigSchema.parse(validConfig)).not.toThrow()

				// 测试无效的超时值
				const invalidConfigs = [
					{ command: "test", timeout: 0 }, // 太低
					{ command: "test", timeout: 3601 }, // 太高
					{ command: "test", timeout: -1 }, // 负值
				]

				invalidConfigs.forEach((config) => {
					expect(() => StdioConfigSchema.parse(config)).toThrow()
				})
			})

			it("should use default timeout of 60 seconds if not specified", async () => {
				const mockConnection: McpConnection = {
					server: {
						name: "test-server",
						config: JSON.stringify({ command: "test" }), // 未指定超时
						status: "connected",
					},
					client: {
						request: jest.fn().mockResolvedValue({ content: [] }),
					} as any,
					transport: {} as any,
				} // 定义 mockConnection 变量

				mcpHub.connections = [mockConnection]
				await mcpHub.callTool("test-server", "test-tool") // 调用工具

				expect(mockConnection.client.request).toHaveBeenCalledWith(
					expect.anything(),
					expect.anything(),
					expect.objectContaining({ timeout: 60000 }), // 60 秒（毫秒）
				)
			})

			it("should apply configured timeout to tool calls", async () => {
				const mockConnection: McpConnection = {
					server: {
						name: "test-server",
						config: JSON.stringify({ command: "test", timeout: 120 }), // 2 分钟
						status: "connected",
					},
					client: {
						request: jest.fn().mockResolvedValue({ content: [] }),
					} as any,
					transport: {} as any,
				} // 定义 mockConnection 变量

				mcpHub.connections = [mockConnection]
				await mcpHub.callTool("test-server", "test-tool") // 调用工具

				expect(mockConnection.client.request).toHaveBeenCalledWith(
					expect.anything(),
					expect.anything(),
					expect.objectContaining({ timeout: 120000 }), // 120 秒（毫秒）
				)
			})
		})

		describe("updateServerTimeout", () => {
			it("should update server timeout in settings file", async () => {
				const mockConfig = {
					mcpServers: {
						"test-server": {
							command: "node",
							args: ["test.js"],
							timeout: 60,
						},
					},
				} // 定义 mockConfig 变量

				// 模拟读取初始配置
				;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

				await mcpHub.updateServerTimeout("test-server", 120) // 更新服务器超时

				// 验证配置是否正确更新
				const writeCall = (fs.writeFile as jest.Mock).mock.calls[0]
				const writtenConfig = JSON.parse(writeCall[1])
				expect(writtenConfig.mcpServers["test-server"].timeout).toBe(120)
			})

			it("should fallback to default timeout when config has invalid timeout", async () => {
				const mockConfig = {
					mcpServers: {
						"test-server": {
							command: "node",
							args: ["test.js"],
							timeout: 60,
						},
					},
				} // 定义 mockConfig 变量

				// 模拟初始读取
				;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

				// 使用无效超时更新
				await mcpHub.updateServerTimeout("test-server", 3601)

				// 配置已写入
				expect(fs.writeFile).toHaveBeenCalled()

				// 设置具有无效超时的连接
				const mockConnection: McpConnection = {
					server: {
						name: "test-server",
						config: JSON.stringify({
							command: "node",
							args: ["test.js"],
							timeout: 3601, // 无效超时
						}),
						status: "connected",
					},
					client: {
						request: jest.fn().mockResolvedValue({ content: [] }),
					} as any,
					transport: {} as any,
				} // 定义 mockConnection 变量

				mcpHub.connections = [mockConnection]

				// 调用工具 - 应使用默认超时
				await mcpHub.callTool("test-server", "test-tool")

				// 验证是否使用了默认超时
				expect(mockConnection.client.request).toHaveBeenCalledWith(
					expect.anything(),
					expect.anything(),
					expect.objectContaining({ timeout: 60000 }), // 默认 60 秒
				)
			})

			it("should accept valid timeout values", async () => {
				const mockConfig = {
					mcpServers: {
						"test-server": {
							command: "node",
							args: ["test.js"],
							timeout: 60,
						},
					},
				} // 定义 mockConfig 变量

				;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

				// 测试有效的超时值
				const validTimeouts = [1, 60, 3600]
				for (const timeout of validTimeouts) {
					await mcpHub.updateServerTimeout("test-server", timeout)
					expect(fs.writeFile).toHaveBeenCalled()
					jest.clearAllMocks() // 为下一次迭代重置
					;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))
				}
			})

			it("should notify webview after updating timeout", async () => {
				const mockConfig = {
					mcpServers: {
						"test-server": {
							command: "node",
							args: ["test.js"],
							timeout: 60,
						},
					},
				} // 定义 mockConfig 变量

				;(fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockConfig))

				await mcpHub.updateServerTimeout("test-server", 120) // 更新服务器超时

				expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith(
					expect.objectContaining({
						type: "mcpServers",
					}),
				) // 验证是否通知了 webview
			})
		})
	})
})
