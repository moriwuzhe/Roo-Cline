// 定义 McpServer 类型
export type McpServer = {
	name: string // 服务器名称
	config: string // 服务器配置
	status: "connected" | "connecting" | "disconnected" // 服务器状态
	error?: string // 可选的错误信息
	tools?: McpTool[] // 可选的工具数组
	resources?: McpResource[] // 可选的资源数组
	resourceTemplates?: McpResourceTemplate[] // 可选的资源模板数组
	disabled?: boolean // 可选的禁用状态
	timeout?: number // 可选的超时时间
}

// 定义 McpTool 类型
export type McpTool = {
	name: string // 工具名称
	description?: string // 可选的工具描述
	inputSchema?: object // 可选的输入模式
	alwaysAllow?: boolean // 可选的始终允许状态
}

// 定义 McpResource 类型
export type McpResource = {
	uri: string // 资源 URI
	name: string // 资源名称
	mimeType?: string // 可选的 MIME 类型
	description?: string // 可选的资源描述
}

// 定义 McpResourceTemplate 类型
export type McpResourceTemplate = {
	uriTemplate: string // URI 模板
	name: string // 模板名称
	description?: string // 可选的模板描述
	mimeType?: string // 可选的 MIME 类型
}

// 定义 McpResourceResponse 类型
export type McpResourceResponse = {
	_meta?: Record<string, any> // 可选的元数据
	contents: Array<{
		uri: string // 资源 URI
		mimeType?: string // 可选的 MIME 类型
		text?: string // 可选的文本内容
		blob?: string // 可选的二进制内容
	}>
}

// 定义 McpToolCallResponse 类型
export type McpToolCallResponse = {
	_meta?: Record<string, any> // 可选的元数据
	content: Array<
		| {
				type: "text" // 内容类型为文本
				text: string // 文本内容
		  }
		| {
				type: "image" // 内容类型为图像
				data: string // 图像数据
				mimeType: string // 图像的 MIME 类型
		  }
		| {
				type: "resource" // 内容类型为资源
				resource: {
					uri: string // 资源 URI
					mimeType?: string // 可选的 MIME 类型
					text?: string // 可选的文本内容
					blob?: string // 可选的二进制内容
				}
		  }
	>
	isError?: boolean // 可选的错误状态
}
