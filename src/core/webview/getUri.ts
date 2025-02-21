// 导入所需模块
import { Uri, Webview } from "vscode"

/**
 * A helper function which will get the webview URI of a given file or resource.
 *
 * @remarks This URI can be used within a webview's HTML as a link to the
 * given file/resource.
 *
 * @param webview A reference to the extension webview
 * @param extensionUri The URI of the directory containing the extension
 * @param pathList An array of strings representing the path to a file/resource
 * @returns A URI pointing to the file/resource
 */
export function getUri(webview: Webview, extensionUri: Uri, pathList: string[]): Uri {
    // 使用 VSCode 提供的 joinPath 方法将路径列表连接成一个完整的路径
    const uri = Uri.joinPath(extensionUri, ...pathList);
    // 将 URI 转换为 webview 可访问的格式
    return webview.asWebviewUri(uri);
}
