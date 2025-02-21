/*
- class declarations
- method declarations (including initializers and deinitializers)
- property declarations
- function declarations
*/
export default `
(class_declaration
  name: (type_identifier) @name) @definition.class // 匹配类声明，并捕获类名

(protocol_declaration
  name: (type_identifier) @name) @definition.interface // 匹配协议声明，并捕获协议名

(class_declaration
    (class_body
        [
            (function_declaration
                name: (simple_identifier) @name // 匹配函数声明，并捕获函数名
            )
            (subscript_declaration
                (parameter (simple_identifier) @name) // 匹配下标声明，并捕获参数名
            )
            (init_declaration "init" @name) // 匹配初始化方法，并捕获方法名
            (deinit_declaration "deinit" @name) // 匹配析构方法，并捕获方法名
        ]
    )
) @definition.method // 捕获方法定义

(class_declaration
    (class_body
        [
            (property_declaration
                (pattern (simple_identifier) @name) // 匹配属性声明，并捕获属性名
            )
        ]
    )
) @definition.property // 捕获属性定义

(property_declaration
    (pattern (simple_identifier) @name) // 匹配属性声明，并捕获属性名
) @definition.property // 捕获属性定义

(function_declaration
    name: (simple_identifier) @name) @definition.function // 匹配函数声明，并捕获函数名
`
