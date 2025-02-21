// 导入所需模块
import * as vscode from 'vscode';

// 定义终端注册表类
export class TerminalRegistry {
    private terminals: Map<string, vscode.Terminal> = new Map();

    // 注册终端
    registerTerminal(name: string, terminal: vscode.Terminal): void {
        this.terminals.set(name, terminal);
    }

    // 获取终端
    getTerminal(name: string): vscode.Terminal | undefined {
        return this.terminals.get(name);
    }

    // 注销终端
    unregisterTerminal(name: string): void {
        const terminal = this.terminals.get(name);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(name);
        }
    }

    // 注销所有终端
    unregisterAllTerminals(): void {
        for (const terminal of this.terminals.values()) {
            terminal.dispose();
        }
        this.terminals.clear();
    }
}
