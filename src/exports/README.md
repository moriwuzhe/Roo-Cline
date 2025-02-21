# Cline API

Cline 扩展公开了一个 API，其他扩展可以使用该 API。要在您的扩展中使用此 API，请执行以下步骤：

1. 将 `src/extension-api/cline.d.ts` 复制到您的扩展的源目录中。
2. 在您的扩展编译中包含 `cline.d.ts`。
3. 使用以下代码获取 API 访问权限：

    ```ts
    const clineExtension = vscode.extensions.getExtension<ClineAPI>("rooveterinaryinc.roo-cline")

    if (!clineExtension?.isActive) {
    	throw new Error("Cline extension is not activated")
    }

    const cline = clineExtension.exports

    if (cline) {
    	 // 现在您可以使用 API

    	// 设置自定义指令
    	await cline.setCustomInstructions("Talk like a pirate")

    	// 获取自定义指令
    	const instructions = await cline.getCustomInstructions()
    	console.log("Current custom instructions:", instructions)

    	// 使用初始消息启动新任务
    	await cline.startNewTask("Hello, Cline! Let's make a new project...")

    	// 使用初始消息和图像启动新任务
    	await cline.startNewTask("Use this design language", ["data:image/webp;base64,..."])

    	// 向当前任务发送消息
    	await cline.sendMessage("Can you fix the @problems?")

    	// 模拟按下聊天界面中的主按钮（例如“保存”或“继续运行”）
    	await cline.pressPrimaryButton()

    	// 模拟按下聊天界面中的次按钮（例如“拒绝”）
    	await cline.pressSecondaryButton()
    } else {
    	console.error("Cline API is not available")
    }
    ```

    **注意：** 为确保在您的扩展之前激活 `rooveterinaryinc.roo-cline` 扩展，请将其添加到 `package.json` 中的 `extensionDependencies`：

    ```json
    "extensionDependencies": [
        "rooveterinaryinc.roo-cline"
    ]
    ```

有关可用方法及其使用的详细信息，请参阅 `cline.d.ts` 文件。
