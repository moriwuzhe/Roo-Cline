export interface ClineAPI {
	/**
	 * 将自定义指令保存到全局存储中。
	 * @param value 要保存的自定义指令。
	 */
	setCustomInstructions(value: string): Promise<void>

	/**
	 * 从全局存储中检索自定义指令。
	 * @returns 保存的自定义指令，如果未设置则返回 undefined。
	 */
	getCustomInstructions(): Promise<string | undefined>

	/**
	 * 使用可选的初始消息和图像启动新任务。
	 * @param task 可选的初始任务消息。
	 * @param images 可选的图像数据 URI 数组（例如 "data:image/webp;base64,..."）。
	 */
	startNewTask(task?: string, images?: string[]): Promise<void>

	/**
	 * 向当前任务发送消息。
	 * @param message 可选的要发送的消息。
	 * @param images 可选的图像数据 URI 数组（例如 "data:image/webp;base64,..."）。
	 */
	sendMessage(message?: string, images?: string[]): Promise<void>

	/**
	 * 模拟按下聊天界面中的主按钮。
	 */
	pressPrimaryButton(): Promise<void>

	/**
	 * 模拟按下聊天界面中的次按钮。
	 */
	pressSecondaryButton(): Promise<void>

	/**
	 * 侧边栏提供者实例。
	 */
	sidebarProvider: ClineSidebarProvider
}
