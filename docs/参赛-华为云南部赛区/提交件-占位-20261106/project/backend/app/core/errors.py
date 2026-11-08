"""区分「能弹给用户的错误」和「只能进日志的错误」，靠类型而不是靠猜文案。

任务失败时 `error` 字段会被前端直接塞进 toast（`wx.showToast` 的 icon:'none' 只显两行，
约 30 个汉字），英文栈、依赖库名、服务器路径这些对用户没有意义，也不该往外吐。
所以只有 UserError 的文本允许走到用户面前，其余异常记日志后回退成通用中文。
"""


class UserError(RuntimeError):
    """文案面向用户：中文、不含栈信息/依赖名/凭据、长度按 toast 两行控制。

    继承 RuntimeError 是为了不改变既有的捕获行为（含测试里的 `pytest.raises(RuntimeError)`）。
    """
