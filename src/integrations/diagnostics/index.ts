import * as vscode from "vscode" // 导入 VSCode 模块
import * as path from "path" // 导入 path 模块，用于路径操作
import deepEqual from "fast-deep-equal" // 导入 fast-deep-equal 模块，用于深度比较

export function getNewDiagnostics(
	oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][],
	newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][],
): [vscode.Uri, vscode.Diagnostic[]][] {
	const newProblems: [vscode.Uri, vscode.Diagnostic[]][] = [] // 存储新问题的数组
	const oldMap = new Map(oldDiagnostics) // 将旧诊断信息转换为 Map

	for (const [uri, newDiags] of newDiagnostics) {
		const oldDiags = oldMap.get(uri) || [] // 获取旧诊断信息
		const newProblemsForUri = newDiags.filter((newDiag) => !oldDiags.some((oldDiag) => deepEqual(oldDiag, newDiag))) // 过滤出新问题

		if (newProblemsForUri.length > 0) {
			newProblems.push([uri, newProblemsForUri]) // 将新问题添加到数组中
		}
	}

	return newProblems // 返回新问题数组
}

// 用法:
// const oldDiagnostics = // ... 旧的诊断信息数组
// const newDiagnostics = // ... 新的诊断信息数组
// const newProblems = getNewDiagnostics(oldDiagnostics, newDiagnostics);

// 使用模拟的示例用法:
//
// // 模拟旧的诊断信息
// const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
//     [vscode.Uri.file("/path/to/file1.ts"), [
//         new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), "Old error in file1", vscode.DiagnosticSeverity.Error)
//     ]],
//     [vscode.Uri.file("/path/to/file2.ts"), [
//         new vscode.Diagnostic(new vscode.Range(5, 5, 5, 15), "Old warning in file2", vscode.DiagnosticSeverity.Warning)
//     ]]
// ];
//
// // 模拟新的诊断信息
// const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
//     [vscode.Uri.file("/path/to/file1.ts"), [
//         new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), "Old error in file1", vscode.DiagnosticSeverity.Error),
//         new vscode.Diagnostic(new vscode.Range(2, 2, 2, 12), "New error in file1", vscode.DiagnosticSeverity.Error)
//     ]],
//     [vscode.Uri.file("/path/to/file2.ts"), [
//         new vscode.Diagnostic(new vscode.Range(5, 5, 5, 15), "Old warning in file2", vscode.DiagnosticSeverity.Warning)
//     ]],
//     [vscode.Uri.file("/path/to/file3.ts"), [
//         new vscode.Diagnostic(new vscode.Range(1, 1, 1, 11), "New error in file3", vscode.DiagnosticSeverity.Error)
//     ]]
// ];
//
// const newProblems = getNewProblems(oldDiagnostics, newDiagnostics);
//
// console.log("New problems:");
// for (const [uri, diagnostics] of newProblems) {
//     console.log(`File: ${uri.fsPath}`);
//     for (const diagnostic of diagnostics) {
//         console.log(`- ${diagnostic.message} (${diagnostic.range.start.line}:${diagnostic.range.start.character})`);
//     }
// }
//
// // 预期输出:
// // New problems:
// // File: /path/to/file1.ts
// // - New error in file1 (2:2)
// // File: /path/to/file3.ts
// // - New error in file3 (1:1)

// 如果没有找到给定严重级别的问题，将返回空字符串
export function diagnosticsToProblemsString(
	diagnostics: [vscode.Uri, vscode.Diagnostic[]][],
	severities: vscode.DiagnosticSeverity[],
	cwd: string,
): string {
	let result = ""
	for (const [uri, fileDiagnostics] of diagnostics) {
		const problems = fileDiagnostics.filter((d) => severities.includes(d.severity)) // 过滤出指定严重级别的问题
		if (problems.length > 0) {
			result += `\n\n${path.relative(cwd, uri.fsPath).toPosix()}` // 添加文件路径
			for (const diagnostic of problems) {
				let label: string
				switch (diagnostic.severity) {
					case vscode.DiagnosticSeverity.Error:
						label = "Error"
						break
					case vscode.DiagnosticSeverity.Warning:
						label = "Warning"
						break
					case vscode.DiagnosticSeverity.Information:
						label = "Information"
						break
					case vscode.DiagnosticSeverity.Hint:
						label = "Hint"
						break
					default:
						label = "Diagnostic"
				}
				const line = diagnostic.range.start.line + 1 // VSCode 的行号是从 0 开始的
				const source = diagnostic.source ? `${diagnostic.source} ` : ""
				result += `\n- [${source}${label}] Line ${line}: ${diagnostic.message}` // 添加问题描述
			}
		}
	}
	return result.trim() // 返回结果字符串
}
