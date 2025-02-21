/*
- 函数签名和声明
- 方法签名和定义
- 抽象方法签名
- 类声明（包括抽象类）
- 模块声明
*/
export default `
(function_signature
  name: (identifier) @name.definition.function) @definition.function // 函数签名，匹配函数名称

(method_signature
  name: (property_identifier) @name.definition.method) @definition.method // 方法签名，匹配方法名称

(abstract_method_signature
  name: (property_identifier) @name.definition.method) @definition.method // 抽象方法签名，匹配抽象方法名称

(abstract_class_declaration
  name: (type_identifier) @name.definition.class) @definition.class // 抽象类声明，匹配抽象类名称

(module
  name: (identifier) @name.definition.module) @definition.module // 模块声明，匹配模块名称

(function_declaration
  name: (identifier) @name.definition.function) @definition.function // 函数声明，匹配函数名称

(method_definition
  name: (property_identifier) @name.definition.method) @definition.method // 方法定义，匹配方法名称

(class_declaration
  name: (type_identifier) @name.definition.class) @definition.class // 类声明，匹配类名称
`
