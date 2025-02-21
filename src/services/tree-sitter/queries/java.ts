/*
- class declarations
- method declarations
- interface declarations
*/
export default `
(class_declaration
  name: (identifier) @name.definition.class) @definition.class // 匹配类声明，并捕获类名

(method_declaration
  name: (identifier) @name.definition.method) @definition.method // 匹配方法声明，并捕获方法名

(interface_declaration
  name: (identifier) @name.definition.interface) @definition.interface // 匹配接口声明，并捕获接口名
`
