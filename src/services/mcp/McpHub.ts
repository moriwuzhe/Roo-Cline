import { Client } from "@modelcontextprotocol/sdk/client/index.js" // 导入 Client 模块
import { StdioClientTransport, StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js" // 导入 StdioClientTransport 和 StdioServerParameters 模块
import {
	CallToolResultSchema,
	ListResourcesResultSchema,
	ListResourceTemplatesResultSchema,
	ListToolsResultSchema,
	ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js" // 导入各种结果模式
import chokidar, { FSWatcher } from "chokidar" // 导入 chokidar 模块
import delay from "delay" // 导入 delay 模块
import deepEqual from "fast-deep-equal" // 导入 deepEqual 模块
import * as fs from "fs/promises" // 导入文件系统模块
import * as path from "path" // 导入路径模块
import * as vscode from "vscode" // 导入 VSCode 模块
import { z } from "zod" // 导入 zod 模块
import { ClineProvider, GlobalFileNames } from "../../core/webview/ClineProvider" // 导入 ClineProvider 和 GlobalFileNames 模块
import {
	McpResource,
	McpResourceResponse,
	McpResourceTemplate,
	McpServer,
	McpTool,
	McpToolCallResponse,
} from "../../shared/mcp" // 导入各种 MCP 类型
import { fileExistsAtPath } from "../../utils/fs" // 导入 fileExistsAtPath 工具函数
import { arePathsEqual } from "../../utils/path" // 导入 arePathsEqual 工具函数

export type McpConnection = {
	server: McpServer // MCP 服务器
	client: Client // 客户端
	transport: StdioClientTransport // 传输
}

// StdioServerParameters
const AlwaysAllowSchema = z.array(z.string()).default([]) // 定义 AlwaysAllowSchema

export const StdioConfigSchema = z.object({
	command: z.string(), // 命令
	args: z.array(z.string()).optional(), // 参数
	env: z.record(z.string()).optional(), // 环境变量
	alwaysAllow: AlwaysAllowSchema.optional(), // 总是允许
	disabled: z.boolean().optional(), // 禁用
	timeout: z.number().min(1).max(3600).optional().default(60), // 超时
})

const McpSettingsSchema = z.object({
	mcpServers: z.record(StdioConfigSchema), // MCP 服务器配置
})

export class McpHub {
	private providerRef: WeakRef<ClineProvider> // 提供者的弱引用
	private disposables: vscode.Disposable[] = [] // 可释放的资源
	private settingsWatcher?: vscode.FileSystemWatcher // 设置文件监视器
	private fileWatchers: Map<string, FSWatcher> = new Map() // 文件监视器映射
	connections: McpConnection[] = [] // 连接数组
	isConnecting: boolean = false // 是否正在连接

	constructor(provider: ClineProvider) {
		this.providerRef = new WeakRef(provider) // 初始化提供者引用
		this.watchMcpSettingsFile() // 监视 MCP 设置文件
		this.initializeMcpServers() // 初始化 MCP 服务器
	}

	getServers(): McpServer[] {
		// 仅返回启用的服务器
		return this.connections.filter((conn) => !conn.server.disabled).map((conn) => conn.server)
	}

	getAllServers(): McpServer[] {
		// 返回所有服务器，无论状态如何
		return this.connections.map((conn) => conn.server)
	}

	async getMcpServersPath(): Promise<string> {
		const provider = this.providerRef.deref()
		if (!provider) {
			throw new Error("Provider not available") // 提供者不可用时抛出错误
		}
		const mcpServersPath = await provider.ensureMcpServersDirectoryExists() // 确保 MCP 服务器目录存在
		return mcpServersPath
	}

	async getMcpSettingsFilePath(): Promise<string> {
		const provider = this.providerRef.deref()
		if (!provider) {
			throw new Error("Provider not available") // 提供者不可用时抛出错误
		}
		const mcpSettingsFilePath = path.join(
			await provider.ensureSettingsDirectoryExists(), // 确保设置目录存在
			GlobalFileNames.mcpSettings, // MCP 设置文件名
		)
		const fileExists = await fileExistsAtPath(mcpSettingsFilePath) // 检查文件是否存在
		if (!fileExists) {
			await fs.writeFile(
				mcpSettingsFilePath,
				`{
  "mcpServers": {
    
  }
}`, // 如果文件不存在，创建一个新的
			)
		}
		return mcpSettingsFilePath
	}

	private async watchMcpSettingsFile(): Promise<void> {
		const settingsPath = await this.getMcpSettingsFilePath() // 获取 MCP 设置文件路径
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument(async (document) => {
				if (arePathsEqual(document.uri.fsPath, settingsPath)) {
					const content = await fs.readFile(settingsPath, "utf-8") // 读取文件内容
					const errorMessage =
						"Invalid MCP settings format. Please ensure your settings follow the correct JSON format." // 错误消息
					let config: any
					try {
						config = JSON.parse(content) // 解析 JSON 内容
					} catch (error) {
						vscode.window.showErrorMessage(errorMessage) // 显示错误消息
						return
					}
					const result = McpSettingsSchema.safeParse(config)
					if (!result.success) {
						vscode.window.showErrorMessage(errorMessage) // 显示错误消息
						return
					}
					try {
						await this.updateServerConnections(result.data.mcpServers || {}) // 更新服务器连接
					} catch (error) {
						console.error("Failed to process MCP settings change:", error) // 处理设置更改失败
					}
				}
			}),
		)
	}

	private async initializeMcpServers(): Promise<void> {
		try {
			const settingsPath = await this.getMcpSettingsFilePath() // 获取 MCP 设置文件路径
			const content = await fs.readFile(settingsPath, "utf-8") // 读取文件内容
			const config = JSON.parse(content) // 解析 JSON 内容
			await this.updateServerConnections(config.mcpServers || {}) // 更新服务器连接
		} catch (error) {
			console.error("Failed to initialize MCP servers:", error) // 初始化服务器失败
		}
	}

	private async connectToServer(name: string, config: StdioServerParameters): Promise<void> {
		// 如果存在现有连接，则移除（不应该发生，连接应在之前删除）
		this.connections = this.connections.filter((conn) => conn.server.name !== name)

		try {
			// 每个 MCP 服务器需要自己的传输连接，并具有独特的功能、配置和错误处理。拥有单独的客户端还允许正确范围的资源/工具和独立的服务器管理，如重新连接。
			const client = new Client(
				{
					name: "Roo Code",
					version: this.providerRef.deref()?.context.extension?.packageJSON?.version ?? "1.0.0",
				},
				{
					capabilities: {},
				},
			)

			const transport = new StdioClientTransport({
				command: config.command,
				args: config.args,
				env: {
					...config.env,
					...(process.env.PATH ? { PATH: process.env.PATH } : {}),
					// ...(process.env.NODE_PATH ? { NODE_PATH: process.env.NODE_PATH } : {}),
				},
				stderr: "pipe", // 必须使 stderr 可用
			})

			transport.onerror = async (error) => {
				console.error(`Transport error for "${name}":`, error) // 处理传输错误
				const connection = this.connections.find((conn) => conn.server.name === name)
				if (connection) {
					connection.server.status = "disconnected" // 更新服务器状态为断开连接
					this.appendErrorMessage(connection, error.message) // 添加错误消息
				}
				await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
			}

			transport.onclose = async () => {
				const connection = this.connections.find((conn) => conn.server.name === name)
				if (connection) {
					connection.server.status = "disconnected" // 更新服务器状态为断开连接
				}
				await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
			}

			// 如果配置无效，显示错误
			if (!StdioConfigSchema.safeParse(config).success) {
				console.error(`Invalid config for "${name}": missing or invalid parameters`) // 配置无效
				const connection: McpConnection = {
					server: {
						name,
						config: JSON.stringify(config),
						status: "disconnected",
						error: "Invalid config: missing or invalid parameters",
					},
					client,
					transport,
				}
				this.connections.push(connection)
				return
			}

			// 有效的模式
			const parsedConfig = StdioConfigSchema.parse(config)
			const connection: McpConnection = {
				server: {
					name,
					config: JSON.stringify(config),
					status: "connecting",
					disabled: parsedConfig.disabled,
				},
				client,
				transport,
			}
			this.connections.push(connection)

			// transport.stderr 仅在进程启动后可用。然而，我们不能单独启动它，因为 .connect() 调用也会启动传输。我们不能在 connect 调用之后放置它，因为我们需要在连接建立之前捕获 stderr 流，以捕获连接过程中的错误。
			// 作为解决方法，我们自己启动传输，然后将 start 方法修改为 no-op，这样 .connect() 就不会再次尝试启动它。
			await transport.start()
			const stderrStream = transport.stderr
			if (stderrStream) {
				stderrStream.on("data", async (data: Buffer) => {
					const errorOutput = data.toString()
					console.error(`Server "${name}" stderr:`, errorOutput) // 处理 stderr 输出
					const connection = this.connections.find((conn) => conn.server.name === name)
					if (connection) {
						// 注意：我们不会将服务器状态设置为“断开连接”，因为 stderr 日志不一定意味着服务器崩溃或断开连接，它可能只是信息性的。实际上，当服务器首次启动时，它会立即将“<name> server running on stdio”记录到 stderr。
						this.appendErrorMessage(connection, errorOutput) // 添加错误消息
						// 仅在服务器已断开连接时立即更新 webview
						if (connection.server.status === "disconnected") {
							await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
						}
					}
				})
			} else {
				console.error(`No stderr stream for ${name}`) // 没有 stderr 流
			}
			transport.start = async () => {} // 现在是 no-op，.connect() 不会失败

			// 连接
			await client.connect(transport)
			connection.server.status = "connected" // 更新服务器状态为已连接
			connection.server.error = "" // 清空错误消息

			// 初始获取工具和资源
			connection.server.tools = await this.fetchToolsList(name)
			connection.server.resources = await this.fetchResourcesList(name)
			connection.server.resourceTemplates = await this.fetchResourceTemplatesList(name)
		} catch (error) {
			// 使用错误更新状态
			const connection = this.connections.find((conn) => conn.server.name === name)
			if (connection) {
				connection.server.status = "disconnected" // 更新服务器状态为断开连接
				this.appendErrorMessage(connection, error instanceof Error ? error.message : String(error)) // 添加错误消息
			}
			throw error
		}
	}

	private appendErrorMessage(connection: McpConnection, error: string) {
		const newError = connection.server.error ? `${connection.server.error}\n${error}` : error
		connection.server.error = newError //.slice(0, 800) // 更新错误消息
	}

	private async fetchToolsList(serverName: string): Promise<McpTool[]> {
		try {
			const response = await this.connections
				.find((conn) => conn.server.name === serverName)
				?.client.request({ method: "tools/list" }, ListToolsResultSchema) // 请求工具列表

			// 获取 always allow 设置
			const settingsPath = await this.getMcpSettingsFilePath()
			const content = await fs.readFile(settingsPath, "utf-8")
			const config = JSON.parse(content)
			const alwaysAllowConfig = config.mcpServers[serverName]?.alwaysAllow || []

			// 根据设置标记工具为 always allow
			const tools = (response?.tools || []).map((tool) => ({
				...tool,
				alwaysAllow: alwaysAllowConfig.includes(tool.name),
			}))

			console.log(`[MCP] Fetched tools for ${serverName}:`, tools) // 打印获取的工具列表
			return tools
		} catch (error) {
			// console.error(`Failed to fetch tools for ${serverName}:`, error)
			return []
		}
	}

	private async fetchResourcesList(serverName: string): Promise<McpResource[]> {
		try {
			const response = await this.connections
				.find((conn) => conn.server.name === serverName)
				?.client.request({ method: "resources/list" }, ListResourcesResultSchema) // 请求资源列表
			return response?.resources || []
		} catch (error) {
			// console.error(`Failed to fetch resources for ${serverName}:`, error)
			return []
		}
	}

	private async fetchResourceTemplatesList(serverName: string): Promise<McpResourceTemplate[]> {
		try {
			const response = await this.connections
				.find((conn) => conn.server.name === serverName)
				?.client.request({ method: "resources/templates/list" }, ListResourceTemplatesResultSchema) // 请求资源模板列表
			return response?.resourceTemplates || []
		} catch (error) {
			// console.error(`Failed to fetch resource templates for ${serverName}:`, error)
			return []
		}
	}

	async deleteConnection(name: string): Promise<void> {
		const connection = this.connections.find((conn) => conn.server.name === name)
		if (connection) {
			try {
				await connection.transport.close() // 关闭传输
				await connection.client.close() // 关闭客户端
			} catch (error) {
				console.error(`Failed to close transport for ${name}:`, error) // 关闭传输失败
			}
			this.connections = this.connections.filter((conn) => conn.server.name !== name) // 移除连接
		}
	}

	async updateServerConnections(newServers: Record<string, any>): Promise<void> {
		this.isConnecting = true // 设置连接状态
		this.removeAllFileWatchers() // 移除所有文件监视器
		const currentNames = new Set(this.connections.map((conn) => conn.server.name))
		const newNames = new Set(Object.keys(newServers))

		// 删除已移除的服务器
		for (const name of currentNames) {
			if (!newNames.has(name)) {
				await this.deleteConnection(name) // 删除连接
				console.log(`Deleted MCP server: ${name}`) // 打印删除的服务器
			}
		}

		// 更新或添加服务器
		for (const [name, config] of Object.entries(newServers)) {
			const currentConnection = this.connections.find((conn) => conn.server.name === name)

			if (!currentConnection) {
				// 新服务器
				try {
					this.setupFileWatcher(name, config) // 设置文件监视器
					await this.connectToServer(name, config) // 连接到服务器
				} catch (error) {
					console.error(`Failed to connect to new MCP server ${name}:`, error) // 连接到新服务器失败
				}
			} else if (!deepEqual(JSON.parse(currentConnection.server.config), config)) {
				// 配置已更改的现有服务器
				try {
					this.setupFileWatcher(name, config) // 设置文件监视器
					await this.deleteConnection(name) // 删除连接
					await this.connectToServer(name, config) // 连接到服务器
					console.log(`Reconnected MCP server with updated config: ${name}`) // 打印重新连接的服务器
				} catch (error) {
					console.error(`Failed to reconnect MCP server ${name}:`, error) // 重新连接服务器失败
				}
			}
			// 如果服务器存在且配置相同，则不执行任何操作
		}
		await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
		this.isConnecting = false // 重置连接状态
	}

	private setupFileWatcher(name: string, config: any) {
		const filePath = config.args?.find((arg: string) => arg.includes("build/index.js"))
		if (filePath) {
			// 我们使用 chokidar 而不是 onDidSaveTextDocument，因为它不需要在编辑器中打开文件。设置配置更适合 onDidSave，因为它将由用户或 Cline 手动更新（我们希望检测保存事件，而不是每次文件更改）
			const watcher = chokidar.watch(filePath, {
				// persistent: true,
				// ignoreInitial: true,
				// awaitWriteFinish: true, // 这有助于原子写入
			})

			watcher.on("change", () => {
				console.log(`Detected change in ${filePath}. Restarting server ${name}...`) // 检测到文件更改
				this.restartConnection(name) // 重启连接
			})

			this.fileWatchers.set(name, watcher) // 设置文件监视器
		}
	}

	private removeAllFileWatchers() {
		this.fileWatchers.forEach((watcher) => watcher.close()) // 关闭所有文件监视器
		this.fileWatchers.clear() // 清空文件监视器映射
	}

	async restartConnection(serverName: string): Promise<void> {
		this.isConnecting = true // 设置连接状态
		const provider = this.providerRef.deref()
		if (!provider) {
			return
		}

		// 获取现有连接并更新其状态
		const connection = this.connections.find((conn) => conn.server.name === serverName)
		const config = connection?.server.config
		if (config) {
			vscode.window.showInformationMessage(`Restarting ${serverName} MCP server...`) // 显示重启消息
			connection.server.status = "connecting" // 更新服务器状态为连接中
			connection.server.error = "" // 清空错误消息
			await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
			await delay(500) // 人为延迟以向用户显示服务器正在重启
			try {
				await this.deleteConnection(serverName) // 删除连接
				// 尝试使用现有配置重新连接
				await this.connectToServer(serverName, JSON.parse(config)) // 连接到服务器
				vscode.window.showInformationMessage(`${serverName} MCP server connected`) // 显示连接成功消息
			} catch (error) {
				console.error(`Failed to restart connection for ${serverName}:`, error) // 重启连接失败
				vscode.window.showErrorMessage(`Failed to connect to ${serverName} MCP server`) // 显示连接失败消息
			}
		}

		await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
		this.isConnecting = false // 重置连接状态
	}

	private async notifyWebviewOfServerChanges(): Promise<void> {
		// 服务器应始终按设置文件中定义的顺序排序
		const settingsPath = await this.getMcpSettingsFilePath() // 获取 MCP 设置文件路径
		const content = await fs.readFile(settingsPath, "utf-8") // 读取文件内容
		const config = JSON.parse(content) // 解析 JSON 内容
		const serverOrder = Object.keys(config.mcpServers || {})
		await this.providerRef.deref()?.postMessageToWebview({
			type: "mcpServers",
			mcpServers: [...this.connections]
				.sort((a, b) => {
					const indexA = serverOrder.indexOf(a.server.name)
					const indexB = serverOrder.indexOf(b.server.name)
					return indexA - indexB
				})
				.map((connection) => connection.server),
		})
	}

	public async toggleServerDisabled(serverName: string, disabled: boolean): Promise<void> {
		let settingsPath: string
		try {
			settingsPath = await this.getMcpSettingsFilePath() // 获取 MCP 设置文件路径

			// 确保设置文件存在且可访问
			try {
				await fs.access(settingsPath)
			} catch (error) {
				console.error("Settings file not accessible:", error) // 设置文件不可访问
				throw new Error("Settings file not accessible")
			}
			const content = await fs.readFile(settingsPath, "utf-8") // 读取文件内容
			const config = JSON.parse(content) // 解析 JSON 内容

			// 验证配置结构
			if (!config || typeof config !== "object") {
				throw new Error("Invalid config structure")
			}

			if (!config.mcpServers || typeof config.mcpServers !== "object") {
				config.mcpServers = {}
			}

			if (config.mcpServers[serverName]) {
				// 创建新的服务器配置对象以确保结构清晰
				const serverConfig = {
					...config.mcpServers[serverName],
					disabled,
				}

				// 确保存在所需字段
				if (!serverConfig.alwaysAllow) {
					serverConfig.alwaysAllow = []
				}

				config.mcpServers[serverName] = serverConfig

				// 将整个配置写回
				const updatedConfig = {
					mcpServers: config.mcpServers,
				}

				await fs.writeFile(settingsPath, JSON.stringify(updatedConfig, null, 2)) // 写入更新的配置

				const connection = this.connections.find((conn) => conn.server.name === serverName)
				if (connection) {
					try {
						connection.server.disabled = disabled // 更新服务器禁用状态

						// 仅在连接时刷新功能
						if (connection.server.status === "connected") {
							connection.server.tools = await this.fetchToolsList(serverName) // 获取工具列表
							connection.server.resources = await this.fetchResourcesList(serverName) // 获取资源列表
							connection.server.resourceTemplates = await this.fetchResourceTemplatesList(serverName) // 获取资源模板列表
						}
					} catch (error) {
						console.error(`Failed to refresh capabilities for ${serverName}:`, error) // 刷新功能失败
					}
				}

				await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
			}
		} catch (error) {
			console.error("Failed to update server disabled state:", error) // 更新服务器禁用状态失败
			if (error instanceof Error) {
				console.error("Error details:", error.message, error.stack) // 错误详情
			}
			vscode.window.showErrorMessage(
				`Failed to update server state: ${error instanceof Error ? error.message : String(error)}`, // 显示错误消息
			)
			throw error
		}
	}

	public async updateServerTimeout(serverName: string, timeout: number): Promise<void> {
		let settingsPath: string
		try {
			settingsPath = await this.getMcpSettingsFilePath() // 获取 MCP 设置文件路径

			// 确保设置文件存在且可访问
			try {
				await fs.access(settingsPath)
			} catch (error) {
				console.error("Settings file not accessible:", error) // 设置文件不可访问
				throw new Error("Settings file not accessible")
			}
			const content = await fs.readFile(settingsPath, "utf-8") // 读取文件内容
			const config = JSON.parse(content) // 解析 JSON 内容

			// 验证配置结构
			if (!config || typeof config !== "object") {
				throw new Error("Invalid config structure")
			}

			if (!config.mcpServers || typeof config.mcpServers !== "object") {
				config.mcpServers = {}
			}

			if (config.mcpServers[serverName]) {
				// 创建新的服务器配置对象以确保结构清晰
				const serverConfig = {
					...config.mcpServers[serverName],
					timeout,
				}

				config.mcpServers[serverName] = serverConfig

				// 将整个配置写回
				const updatedConfig = {
					mcpServers: config.mcpServers,
				}

				await fs.writeFile(settingsPath, JSON.stringify(updatedConfig, null, 2)) // 写入更新的配置
				await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
			}
		} catch (error) {
			console.error("Failed to update server timeout:", error) // 更新服务器超时失败
			if (error instanceof Error) {
				console.error("Error details:", error.message, error.stack) // 错误详情
			}
			vscode.window.showErrorMessage(
				`Failed to update server timeout: ${error instanceof Error ? error.message : String(error)}`, // 显示错误消息
			)
			throw error
		}
	}

	async readResource(serverName: string, uri: string): Promise<McpResourceResponse> {
		const connection = this.connections.find((conn) => conn.server.name === serverName)
		if (!connection) {
			throw new Error(`No connection found for server: ${serverName}`) // 未找到服务器连接
		}
		if (connection.server.disabled) {
			throw new Error(`Server "${serverName}" is disabled`) // 服务器已禁用
		}
		return await connection.client.request(
			{
				method: "resources/read",
				params: {
					uri,
				},
			},
			ReadResourceResultSchema, // 请求读取资源
		)
	}

	async callTool(
		serverName: string,
		toolName: string,
		toolArguments?: Record<string, unknown>,
	): Promise<McpToolCallResponse> {
		const connection = this.connections.find((conn) => conn.server.name === serverName)
		if (!connection) {
			throw new Error(
				`No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`, // 未找到服务器连接
			)
		}
		if (connection.server.disabled) {
			throw new Error(`Server "${serverName}" is disabled and cannot be used`) // 服务器已禁用
		}

		let timeout: number
		try {
			const parsedConfig = StdioConfigSchema.parse(JSON.parse(connection.server.config))
			timeout = (parsedConfig.timeout ?? 60) * 1000 // 解析超时配置
		} catch (error) {
			console.error("Failed to parse server config for timeout:", error) // 解析超时配置失败
			// 如果解析失败，默认超时为 60 秒
			timeout = 60 * 1000
		}

		return await connection.client.request(
			{
				method: "tools/call",
				params: {
					name: toolName,
					arguments: toolArguments,
				},
			},
			CallToolResultSchema, // 请求调用工具
			{
				timeout,
			},
		)
	}

	async toggleToolAlwaysAllow(serverName: string, toolName: string, shouldAllow: boolean): Promise<void> {
		try {
			const settingsPath = await this.getMcpSettingsFilePath() // 获取 MCP 设置文件路径
			const content = await fs.readFile(settingsPath, "utf-8") // 读取文件内容
			const config = JSON.parse(content) // 解析 JSON 内容

			// 如果 alwaysAllow 不存在，则初始化
			if (!config.mcpServers[serverName].alwaysAllow) {
				config.mcpServers[serverName].alwaysAllow = []
			}

			const alwaysAllow = config.mcpServers[serverName].alwaysAllow
			const toolIndex = alwaysAllow.indexOf(toolName)

			if (shouldAllow && toolIndex === -1) {
				// 将工具添加到 always allow 列表
				alwaysAllow.push(toolName)
			} else if (!shouldAllow && toolIndex !== -1) {
				// 从 always allow 列表中移除工具
				alwaysAllow.splice(toolIndex, 1)
			}

			// 将更新的配置写回文件
			await fs.writeFile(settingsPath, JSON.stringify(config, null, 2)) // 写入更新的配置

			// 更新工具列表以反映更改
			const connection = this.connections.find((conn) => conn.server.name === serverName)
			if (connection) {
				connection.server.tools = await this.fetchToolsList(serverName) // 获取工具列表
				await this.notifyWebviewOfServerChanges() // 通知 webview 服务器更改
			}
		} catch (error) {
			console.error("Failed to update always allow settings:", error) // 更新 always allow 设置失败
			vscode.window.showErrorMessage("Failed to update always allow settings") // 显示错误消息
			throw error // 重新抛出以确保错误被正确处理
		}
	}

	async dispose(): Promise<void> {
		this.removeAllFileWatchers() // 移除所有文件监视器
		for (const connection of this.connections) {
			try {
				await this.deleteConnection(connection.server.name) // 删除连接
			} catch (error) {
				console.error(`Failed to close connection for ${connection.server.name}:`, error) // 关闭连接失败
			}
		}
		this.connections = [] // 清空连接数组
		if (this.settingsWatcher) {
			this.settingsWatcher.dispose() // 释放设置文件监视器
		}
		this.disposables.forEach((d) => d.dispose()) // 释放所有可释放的资源
	}
}
