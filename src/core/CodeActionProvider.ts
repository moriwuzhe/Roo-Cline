import * as vscode from "vscode" // 导入 VSCode 模块
import { EditorUtils } from "./EditorUtils" // 导入 EditorUtils 模块

export const ACTION_NAMES = {
	EXPLAIN: "Roo Code: Explain Code", // 解释代码
	FIX: "Roo Code: Fix Code", // 修复代码
	FIX_LOGIC: "Roo Code: Fix Logic", // 修复逻辑
	IMPROVE: "Roo Code: Improve Code", // 改进代码
	ADD_TO_CONTEXT: "Roo Code: Add to Context", // 添加到上下文
} as const

export const COMMAND_IDS = {
	EXPLAIN: "roo-cline.explainCode", // 解释代码命令 ID
	FIX: "roo-cline.fixCode", // 修复代码命令 ID
	IMPROVE: "roo-cline.improveCode", // 改进代码命令 ID
	ADD_TO_CONTEXT: "roo-cline.addToContext", // 添加到上下文命令 ID
} as const

export class CodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix, // 快速修复
		vscode.CodeActionKind.RefactorRewrite, // 重写重构
	]

	private createAction(title: string, kind: vscode.CodeActionKind, command: string, args: any[]): vscode.CodeAction {
		const action = new vscode.CodeAction(title, kind) // 创建一个新的代码操作
		action.command = { command, title, arguments: args } // 设置代码操作的命令
		return action // 返回代码操作
	}

	private createActionPair(
		baseTitle: string,
		kind: vscode.CodeActionKind,
		baseCommand: string,
		args: any[],
	): vscode.CodeAction[] {
		return [
			this.createAction(`${baseTitle} in New Task`, kind, baseCommand, args), // 创建一个新的任务中的代码操作
			this.createAction(`${baseTitle} in Current Task`, kind, `${baseCommand}InCurrentTask`, args), // 创建一个当前任务中的代码操作
		]
	}

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		try {
			const effectiveRange = EditorUtils.getEffectiveRange(document, range) // 获取有效范围
			if (!effectiveRange) {
				return [] // 如果没有有效范围，返回空数组
			}

			const filePath = EditorUtils.getFilePath(document) // 获取文件路径
			const actions: vscode.CodeAction[] = [] // 创建一个代码操作数组

			actions.push(
				...this.createActionPair(ACTION_NAMES.EXPLAIN, vscode.CodeActionKind.QuickFix, COMMAND_IDS.EXPLAIN, [
					filePath,
					effectiveRange.text,
				]),
			)

			if (context.diagnostics.length > 0) {
				const relevantDiagnostics = context.diagnostics.filter((d) =>
					EditorUtils.hasIntersectingRange(effectiveRange.range, d.range),
				)

				if (relevantDiagnostics.length > 0) {
					const diagnosticMessages = relevantDiagnostics.map(EditorUtils.createDiagnosticData)
					actions.push(
						...this.createActionPair(ACTION_NAMES.FIX, vscode.CodeActionKind.QuickFix, COMMAND_IDS.FIX, [
							filePath,
							effectiveRange.text,
							diagnosticMessages,
						]),
					)
				}
			} else {
				actions.push(
					...this.createActionPair(ACTION_NAMES.FIX_LOGIC, vscode.CodeActionKind.QuickFix, COMMAND_IDS.FIX, [
						filePath,
						effectiveRange.text,
					]),
				)
			}

			actions.push(
				...this.createActionPair(
					ACTION_NAMES.IMPROVE,
					vscode.CodeActionKind.RefactorRewrite,
					COMMAND_IDS.IMPROVE,
					[filePath, effectiveRange.text],
				),
			)

			actions.push(
				this.createAction(
					ACTION_NAMES.ADD_TO_CONTEXT,
					vscode.CodeActionKind.QuickFix,
					COMMAND_IDS.ADD_TO_CONTEXT,
					[filePath, effectiveRange.text],
				),
			)

			return actions
		} catch (error) {
			console.error("Error providing code actions:", error)
			return []
		}
	}
}
