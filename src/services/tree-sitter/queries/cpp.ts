/*
- struct declarations
- union declarations
- function declarations
- method declarations (with namespace scope)
- typedef declarations
- class declarations
*/
export default `
(struct_specifier name: (type_identifier) @name.definition.class body:(_)) @definition.class // 匹配结构体声明，并捕获结构体名

(declaration type: (union_specifier name: (type_identifier) @name.definition.class)) @definition.class // 匹配联合体声明，并捕获联合体名

(function_declarator declarator: (identifier) @name.definition.function) @definition.function // 匹配函数声明，并捕获函数名

(function_declarator declarator: (field_identifier) @name.definition.function) @definition.function // 匹配字段函数声明，并捕获函数名

(function_declarator declarator: (qualified_identifier scope: (namespace_identifier) @scope name: (identifier) @name.definition.method)) @definition.method // 匹配带命名空间的方法声明，并捕获方法名

(type_definition declarator: (type_identifier) @name.definition.type) @definition.type // 匹配类型定义，并捕获类型名

(class_specifier name: (type_identifier) @name.definition.class) @definition.class // 匹配类声明，并捕获类名
`
