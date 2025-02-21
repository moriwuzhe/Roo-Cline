/*
- struct declarations
- union declarations
- function declarations
- typedef declarations
*/
export default `
(struct_specifier name: (type_identifier) @name.definition.class body:(_)) @definition.class // 匹配结构体声明，并捕获结构体名

(declaration type: (union_specifier name: (type_identifier) @name.definition.class)) @definition.class // 匹配联合体声明，并捕获联合体名

(function_declarator declarator: (identifier) @name.definition.function) @definition.function // 匹配函数声明，并捕获函数名

(type_definition declarator: (type_identifier) @name.definition.type) @definition.type // 匹配类型定义，并捕获类型名
`
