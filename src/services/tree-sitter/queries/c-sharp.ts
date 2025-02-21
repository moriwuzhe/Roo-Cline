/*
- class declarations
- interface declarations
- method declarations
- namespace declarations
*/
export default `
(class_declaration
 name: (identifier) @name.definition.class
) @definition.class // 匹配类声明，并捕获类名

(interface_declaration
 name: (identifier) @name.definition.interface
) @definition.interface // 匹配接口声明，并捕获接口名

(method_declaration
 name: (identifier) @name.definition.method
) @definition.method // 匹配方法声明，并捕获方法名

(namespace_declaration
 name: (identifier) @name.definition.module
) @definition.module // 匹配命名空间声明，并捕获命名空间名
`
