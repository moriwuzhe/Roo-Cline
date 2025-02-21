import * as vscode from "vscode" // 导入 VSCode 模块
import * as path from "path" // 导入 path 模块，用于路径操作
import * as fs from "fs/promises" // 导入 fs/promises 模块，用于文件系统操作
import { createDirectoriesForFile } from "../../utils/fs" // 导入创建目录的工具函数
import { arePathsEqual } from "../../utils/path" // 导入路径比较工具函数
import { formatResponse } from "../../core/prompts/responses" // 导入响应格式化工具函数
import { DecorationController } from "./DecorationController" // 导入装饰控制器
import * as diff from "diff" // 导入 diff 模块，用于比较文本差异
import { diagnosticsToProblemsString, getNewDiagnostics } from "../diagnostics" // 导入诊断工具函数

export const DIFF_VIEW_URI_SCHEME = "cline-diff" // 定义差异视图的 URI 方案

export class DiffViewProvider {
	editType?: "create" | "modify" // 编辑类型，可以是创建或修改
	isEditing = false // 是否正在编辑
	originalContent: string | undefined // 原始内容
	private createdDirs: string[] = [] // 已创建的目录
	private documentWasOpen = false // 文档是否已打开
	private relPath?: string // 相对路径
	private newContent?: string // 新内容
	private activeDiffEditor?: vscode.TextEditor // 活动的差异编辑器
	private fadedOverlayController?: DecorationController // 淡化覆盖控制器
	private activeLineController?: DecorationController // 活动行控制器
	private streamedLines: string[] = [] // 流式传输的行
	private preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [] // 编辑前的诊断信息

	constructor(private cwd: string) {} // 构造函数，接受当前工作目录

	async open(relPath: string): Promise<void> {
		this.relPath = relPath
		const fileExists = this.editType === "modify" // 判断文件是否存在
		const absolutePath = path.resolve(this.cwd, relPath) // 解析绝对路径
		this.isEditing = true
		// 如果文件已打开，确保它未被修改
		if (fileExists) {
			const existingDocument = vscode.workspace.textDocuments.find((doc) =>
				arePathsEqual(doc.uri.fsPath, absolutePath),
			)
			if (existingDocument && existingDocument.isDirty) {
				await existingDocument.save()
			}
		}

		 // 获取编辑文件前的诊断信息
		this.preDiagnostics = vscode.languages.getDiagnostics()

		if (fileExists) {
			this.originalContent = await fs.readFile(absolutePath, "utf-8") // 读取原始内容
		} else {
			this.originalContent = ""
		}
		// 对于新文件，创建必要的目录并记录新目录以便用户拒绝操作时删除
		this.createdDirs = await createDirectoriesForFile(absolutePath)
		// 确保文件存在
		if (!fileExists) {
			await fs.writeFile(absolutePath, "")
		}
		// 如果文件已打开，关闭它（必须在显示差异视图后进行，因为如果它是唯一的标签，列将关闭）
		this.documentWasOpen = false
		// 关闭已打开的标签（上面已保存）
		const tabs = vscode.window.tabGroups.all
			.map((tg) => tg.tabs)
			.flat()
			.filter(
				(tab) => tab.input instanceof vscode.TabInputText && arePathsEqual(tab.input.uri.fsPath, absolutePath),
			)
		for (const tab of tabs) {
			if (!tab.isDirty) {
				await vscode.window.tabGroups.close(tab)
			}
			this.documentWasOpen = true
		}
		this.activeDiffEditor = await this.openDiffEditor() // 打开差异编辑器
		this.fadedOverlayController = new DecorationController("fadedOverlay", this.activeDiffEditor) // 创建淡化覆盖控制器
		this.activeLineController = new DecorationController("activeLine", this.activeDiffEditor) // 创建活动行控制器
		// 初始时对所有行应用淡化覆盖
		this.fadedOverlayController.addLines(0, this.activeDiffEditor.document.lineCount)
		this.scrollEditorToLine(0) // 滚动到第一行
		this.streamedLines = []
	}

	async update(accumulatedContent: string, isFinal: boolean) {
		if (!this.relPath || !this.activeLineController || !this.fadedOverlayController) {
			throw new Error("Required values not set")
		}
		this.newContent = accumulatedContent
		const accumulatedLines = accumulatedContent.split("\n")
		if (!isFinal) {
			accumulatedLines.pop() // 如果不是最终更新，移除最后一行
		}

		const diffEditor = this.activeDiffEditor
		const document = diffEditor?.document
		if (!diffEditor || !document) {
			throw new Error("User closed text editor, unable to edit file...")
		}

		 // 将光标放置在差异编辑器的开头，以避免干扰流动画
		const beginningOfDocument = new vscode.Position(0, 0)
		diffEditor.selection = new vscode.Selection(beginningOfDocument, beginningOfDocument)

		const endLine = accumulatedLines.length
		// 用累积的行替换当前行
		const edit = new vscode.WorkspaceEdit()
		const rangeToReplace = new vscode.Range(0, 0, endLine + 1, 0)
		const contentToReplace = accumulatedLines.slice(0, endLine + 1).join("\n") + "\n"
		edit.replace(document.uri, rangeToReplace, contentToReplace)
		await vscode.workspace.applyEdit(edit)
		// 更新装饰
		this.activeLineController.setActiveLine(endLine)
		this.fadedOverlayController.updateOverlayAfterLine(endLine, document.lineCount)
		// 滚动到当前行
		this.scrollEditorToLine(endLine)

		// 用新的累积内容更新 streamedLines
		this.streamedLines = accumulatedLines
		if (isFinal) {
			// 如果新内容比原始内容短，处理剩余行
			if (this.streamedLines.length < document.lineCount) {
				const edit = new vscode.WorkspaceEdit()
				edit.delete(document.uri, new vscode.Range(this.streamedLines.length, 0, document.lineCount, 0))
				await vscode.workspace.applyEdit(edit)
			}
			// 如果原始内容有空的最后一行，保留它
			const hasEmptyLastLine = this.originalContent?.endsWith("\n")
			if (hasEmptyLastLine && !accumulatedContent.endsWith("\n")) {
				accumulatedContent += "\n"
			}
			// 应用最终内容
			const finalEdit = new vscode.WorkspaceEdit()
			finalEdit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), accumulatedContent)
			await vscode.workspace.applyEdit(finalEdit)
			// 清除所有装饰（在应用最终编辑后）
			this.fadedOverlayController.clear()
			this.activeLineController.clear()
		}
	}

	async saveChanges(): Promise<{
		newProblemsMessage: string | undefined
		userEdits: string | undefined
		finalContent: string | undefined
	}> {
		if (!this.relPath || !this.newContent || !this.activeDiffEditor) {
			return { newProblemsMessage: undefined, userEdits: undefined, finalContent: undefined }
		}
		const absolutePath = path.resolve(this.cwd, this.relPath)
		const updatedDocument = this.activeDiffEditor.document
		const editedContent = updatedDocument.getText()
		if (updatedDocument.isDirty) {
			await updatedDocument.save()
		}

		await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), { preview: false })
		await this.closeAllDiffViews()

		/*
		在文件编辑前后获取诊断信息比实时自动跟踪问题更好。这种方法确保我们只报告直接由此特定编辑导致的新问题。
		由于这些是由 Roo 的编辑导致的新问题，我们知道它们直接与他正在做的工作相关。这消除了 Roo 偏离任务或被无关问题分心的风险，这是以前自动调试方法的问题。
		某些用户的机器可能会慢慢更新诊断信息，因此这种方法在自动化和避免 Roo 可能因过时的问题信息而陷入循环之间提供了良好的平衡。
		如果在用户接受更改时没有出现新问题，他们可以稍后使用 '@problems' 提及进行调试。
		这样，Roo 只会意识到由他的编辑导致的新问题，并可以相应地解决它们。如果在应用修复后问题没有立即更改，不会通知他，这通常是可以的，因为初始修复通常是正确的，可能只是需要时间让 linter 跟上。
		*/
		const postDiagnostics = vscode.languages.getDiagnostics()
		const newProblems = diagnosticsToProblemsString(
			getNewDiagnostics(this.preDiagnostics, postDiagnostics),
			[
				vscode.DiagnosticSeverity.Error, // 仅包括错误，因为警告可能会分散注意力（如果用户想修复警告，他们可以使用 @problems 提及）
			],
			this.cwd,
		) // 如果没有错误，将为空字符串
		const newProblemsMessage =
			newProblems.length > 0 ? `\n\nNew problems detected after saving the file:\n${newProblems}` : ""

		// 如果编辑内容具有不同的 EOL 字符，我们不希望显示所有 EOL 差异的差异。
		const newContentEOL = this.newContent.includes("\r\n") ? "\r\n" : "\n"
		const normalizedEditedContent = editedContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL // trimEnd 以修复编辑器自动添加额外新行的问题
		// 以防新内容混合了不同的 EOL 字符
		const normalizedNewContent = this.newContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL
		if (normalizedEditedContent !== normalizedNewContent) {
			// 用户在批准编辑前进行了更改
			const userEdits = formatResponse.createPrettyPatch(
				this.relPath.toPosix(),
				normalizedNewContent,
				normalizedEditedContent,
			)
			return { newProblemsMessage, userEdits, finalContent: normalizedEditedContent }
		} else {
			// 没有对 cline 的编辑进行更改
			return { newProblemsMessage, userEdits: undefined, finalContent: normalizedEditedContent }
		}
	}

	async revertChanges(): Promise<void> {
		if (!this.relPath || !this.activeDiffEditor) {
			return
		}
		const fileExists = this.editType === "modify"
		const updatedDocument = this.activeDiffEditor.document
		const absolutePath = path.resolve(this.cwd, this.relPath)
		if (!fileExists) {
			if (updatedDocument.isDirty) {
				await updatedDocument.save()
			}
			await this.closeAllDiffViews()
			await fs.unlink(absolutePath)
			// 仅删除我们创建的目录，按相反顺序
			for (let i = this.createdDirs.length - 1; i >= 0; i--) {
				await fs.rmdir(this.createdDirs[i])
				console.log(`Directory ${this.createdDirs[i]} has been deleted.`)
			}
			console.log(`File ${absolutePath} has been deleted.`)
		} else {
			// 恢复文档
			const edit = new vscode.WorkspaceEdit()
			const fullRange = new vscode.Range(
				updatedDocument.positionAt(0),
				updatedDocument.positionAt(updatedDocument.getText().length),
			)
			edit.replace(updatedDocument.uri, fullRange, this.originalContent ?? "")
			// 应用编辑并保存，由于内容不应更改，这不会显示在本地历史记录中，除非用户在编辑期间进行了更改并保存
			await vscode.workspace.applyEdit(edit)
			await updatedDocument.save()
			console.log(`File ${absolutePath} has been reverted to its original content.`)
			if (this.documentWasOpen) {
				await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), {
					preview: false,
				})
			}
			await this.closeAllDiffViews()
		}

		// 编辑完成
		await this.reset()
	}

	private async closeAllDiffViews() {
		const tabs = vscode.window.tabGroups.all
			.flatMap((tg) => tg.tabs)
			.filter(
				(tab) =>
					tab.input instanceof vscode.TabInputTextDiff &&
					tab.input?.original?.scheme === DIFF_VIEW_URI_SCHEME,
			)
		for (const tab of tabs) {
			// 尝试关闭脏视图会导致保存弹出窗口
			if (!tab.isDirty) {
				await vscode.window.tabGroups.close(tab)
			}
		}
	}

	private async openDiffEditor(): Promise<vscode.TextEditor> {
		if (!this.relPath) {
			throw new Error("No file path set")
		}
		const uri = vscode.Uri.file(path.resolve(this.cwd, this.relPath))
		// 如果此差异编辑器已打开（即如果先前的写文件被中断），则应激活它而不是打开新的差异
		const diffTab = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.find(
				(tab) =>
					tab.input instanceof vscode.TabInputTextDiff &&
					tab.input?.original?.scheme === DIFF_VIEW_URI_SCHEME &&
					arePathsEqual(tab.input.modified.fsPath, uri.fsPath),
			)
		if (diffTab && diffTab.input instanceof vscode.TabInputTextDiff) {
			const editor = await vscode.window.showTextDocument(diffTab.input.modified)
			return editor
		}
		// 打开新的差异编辑器
		return new Promise<vscode.TextEditor>((resolve, reject) => {
			const fileName = path.basename(uri.fsPath)
			const fileExists = this.editType === "modify"
			const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor && arePathsEqual(editor.document.uri.fsPath, uri.fsPath)) {
					disposable.dispose()
					resolve(editor)
				}
			})
			vscode.commands.executeCommand(
				"vscode.diff",
				vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${fileName}`).with({
					query: Buffer.from(this.originalContent ?? "").toString("base64"),
				}),
				uri,
				`${fileName}: ${fileExists ? "Original ↔ Roo's Changes" : "New File"} (Editable)`,
			)
			// 这可能发生在非常慢的机器上，例如项目 idx
			setTimeout(() => {
				disposable.dispose()
				reject(new Error("Failed to open diff editor, please try again..."))
			}, 10_000)
		})
	}

	private scrollEditorToLine(line: number) {
		if (this.activeDiffEditor) {
			const scrollLine = line + 4
			this.activeDiffEditor.revealRange(
				new vscode.Range(scrollLine, 0, scrollLine, 0),
				vscode.TextEditorRevealType.InCenter,
			)
		}
	}

	scrollToFirstDiff() {
		if (!this.activeDiffEditor) {
			return
		}
		const currentContent = this.activeDiffEditor.document.getText()
		const diffs = diff.diffLines(this.originalContent || "", currentContent)
		let lineCount = 0
		for (const part of diffs) {
			if (part.added || part.removed) {
				// 找到第一个差异，滚动到它
				this.activeDiffEditor.revealRange(
					new vscode.Range(lineCount, 0, lineCount, 0),
					vscode.TextEditorRevealType.InCenter,
				)
				return
			}
			if (!part.removed) {
				lineCount += part.count || 0
			}
		}
	}

	// 关闭编辑器（如果已打开）
	async reset() {
		this.editType = undefined
		this.isEditing = false
		this.originalContent = undefined
		this.createdDirs = []
		this.documentWasOpen = false
		this.activeDiffEditor = undefined
		this.fadedOverlayController = undefined
		this.activeLineController = undefined
		this.streamedLines = []
		this.preDiagnostics = []
	}
}
