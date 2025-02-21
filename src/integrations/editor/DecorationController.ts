import * as vscode from "vscode" // 导入 VSCode 模块

// 创建淡化覆盖装饰类型
const fadedOverlayDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 0, 0.1)", // 背景颜色
	opacity: "0.4", // 不透明度
	isWholeLine: true, // 是否应用于整行
})

// 创建活动行装饰类型
const activeLineDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(255, 255, 0, 0.3)", // 背景颜色
	opacity: "1", // 不透明度
	isWholeLine: true, // 是否应用于整行
	border: "1px solid rgba(255, 255, 0, 0.5)", // 边框
})

// 装饰类型
type DecorationType = "fadedOverlay" | "activeLine"

export class DecorationController {
	private decorationType: DecorationType // 装饰类型
	private editor: vscode.TextEditor // 编辑器实例
	private ranges: vscode.Range[] = [] // 范围数组

	constructor(decorationType: DecorationType, editor: vscode.TextEditor) {
		this.decorationType = decorationType
		this.editor = editor
	}

	getDecoration() {
		switch (this.decorationType) {
			case "fadedOverlay":
				return fadedOverlayDecorationType // 返回淡化覆盖装饰类型
			case "activeLine":
				return activeLineDecorationType // 返回活动行装饰类型
		}
	}

	addLines(startIndex: number, numLines: number) {
		// 防止无效输入
		if (startIndex < 0 || numLines <= 0) {
			return
		}

		const lastRange = this.ranges[this.ranges.length - 1]
		if (lastRange && lastRange.end.line === startIndex - 1) {
			this.ranges[this.ranges.length - 1] = lastRange.with(undefined, lastRange.end.translate(numLines)) // 更新最后一个范围
		} else {
			const endLine = startIndex + numLines - 1
			this.ranges.push(new vscode.Range(startIndex, 0, endLine, Number.MAX_SAFE_INTEGER)) // 添加新范围
		}

		this.editor.setDecorations(this.getDecoration(), this.ranges) // 设置装饰
	}

	clear() {
		this.ranges = [] // 清空范围数组
		this.editor.setDecorations(this.getDecoration(), this.ranges) // 清除装饰
	}

	updateOverlayAfterLine(line: number, totalLines: number) {
		// 移除从当前行开始的所有现有范围
		this.ranges = this.ranges.filter((range) => range.end.line < line)

		// 为当前行之后的所有行添加新范围
		if (line < totalLines - 1) {
			this.ranges.push(
				new vscode.Range(
					new vscode.Position(line + 1, 0),
					new vscode.Position(totalLines - 1, Number.MAX_SAFE_INTEGER),
				),
			)
		}

		// 应用更新后的装饰
		this.editor.setDecorations(this.getDecoration(), this.ranges)
	}

	setActiveLine(line: number) {
		this.ranges = [new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)] // 设置活动行范围
		this.editor.setDecorations(this.getDecoration(), this.ranges) // 设置装饰
	}
}
