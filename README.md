# 今日老婆 - NapCat 插件

一个有趣的群聊互动插件，当用户发送包含"今日老婆"关键词的消息时，随机抽取一位群成员作为今日老婆。

## 功能特性

- ✅ 关键词触发：当群聊消息包含"今日老婆"时触发
- ✅ 公平随机：使用 Fisher-Yates 洗牌算法确保抽取公平
- ✅ 头像展示：自动获取并展示被抽取成员的 QQ 头像
- ✅ @发送者：回复消息时自动 @ 消息发送者
- ✅ 每日记录：同一用户每天只能抽取一次，重复触发会显示之前的抽取结果
- ✅ 冷却机制：防止刷屏，默认 30 秒冷却时间
- ✅ 错误处理：完善的异常处理和友好的错误提示

## 安装方法

1. 将 `index.mjs` 和 `package.json` 文件复制到 NapCat 的 `plugins/napcat-plugin-today-wife/` 目录
2. 重启 NapCat 或在 WebUI 中刷新插件

## 配置说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | true | 是否启用插件 |
| `keyword` | string | "今日老婆" | 触发关键词 |
| `cooldown` | number | 30000 | 冷却时间（毫秒） |
| `excludeBot` | boolean | true | 是否排除机器人账号 |
| `excludeUsers` | string | "" | 排除的用户ID，逗号分隔 |

## 使用示例

在群聊中发送：
```
今日老婆
```

插件会回复：
```
@发送者 今天你的老婆是 @被抽取成员
[被抽取成员的头像图片]
```

## 技术实现

### 随机算法
使用 Fisher-Yates 洗牌算法，确保每个成员被选中的概率完全相等：

```javascript
function selectRandomMember(members) {
    const shuffled = [...members];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled[0];
}
```

### 头像获取
使用 QQ 官方头像 API：
```
https://q1.qlogo.cn/g?b=qq&nk={user_id}&s=640
```

### 消息格式
回复消息包含三个消息段：
1. `at` - @消息发送者
2. `text` - 文本内容
3. `image` - 被抽取成员头像

## 错误处理

- 群成员列表获取失败：提示"获取群成员列表失败，请稍后重试"
- 无可抽取成员：提示"没有可抽取的群成员"
- 其他异常：提示"处理请求时发生错误，请稍后重试"

## 许可证

MIT License
