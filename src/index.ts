/**
 * 今日老婆插件 - 主入口
 * 当群聊中用户发送包含"今日老婆"关键词的消息时，随机抽取一位群成员作为今日老婆
 */

import type { 
    NapCatPluginContext, 
    MessageEvent, 
    GroupMember, 
    PluginConfig,
    TodayWifeRecord,
    MessageSegment
} from './types.js';

/**
 * 插件默认配置
 */
const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    keyword: '今日老婆',
    cooldown: 30000,
    excludeBot: true,
    excludeUsers: []
};

/**
 * 清理过期记录的定时器间隔（毫秒）
 */
const CLEANUP_INTERVAL = 3600000;

/**
 * 记录过期时间（毫秒）- 24小时
 */
const RECORD_EXPIRY = 86400000;

/**
 * 全局状态管理
 */
class PluginState {
    private ctx: NapCatPluginContext | null = null;
    private config: PluginConfig = DEFAULT_CONFIG;
    private cooldownMap: Map<string, number> = new Map();
    private todayWifeRecords: Map<string, TodayWifeRecord> = new Map();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * 初始化插件状态
     * @param ctx 插件上下文对象
     */
    init(ctx: NapCatPluginContext): void {
        this.ctx = ctx;
        this.startCleanupTimer();
    }

    /**
     * 启动定时清理任务
     */
    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredRecords();
        }, CLEANUP_INTERVAL);
    }

    /**
     * 清理过期记录
     * 清理超过24小时的今日老婆记录和已过期的冷却记录
     */
    private cleanupExpiredRecords(): void {
        const now = Date.now();
        let cleanedCooldownCount = 0;
        let cleanedRecordCount = 0;
        
        // 清理冷却记录 - 清理超过冷却时间2倍的记录（避免边界问题）
        const cooldownExpiry = Math.max(this.config.cooldown * 2, 60000); // 至少保留1分钟
        for (const [key, timestamp] of this.cooldownMap.entries()) {
            if (now - timestamp > cooldownExpiry) {
                this.cooldownMap.delete(key);
                cleanedCooldownCount++;
            }
        }
        
        // 清理今日老婆记录 - 清理超过24小时的记录
        for (const [key, record] of this.todayWifeRecords.entries()) {
            if (now - record.timestamp > RECORD_EXPIRY) {
                this.todayWifeRecords.delete(key);
                cleanedRecordCount++;
            }
        }
        
        if (cleanedCooldownCount > 0 || cleanedRecordCount > 0) {
            this.log('debug', `[今日老婆] 已清理过期记录: ${cleanedCooldownCount} 条冷却记录, ${cleanedRecordCount} 条老婆记录`);
        }
    }

    /**
     * 停止清理定时器
     */
    stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * 获取插件上下文
     */
    getCtx(): NapCatPluginContext | null {
        return this.ctx;
    }

    /**
     * 获取当前配置
     */
    getConfig(): PluginConfig {
        return this.config;
    }

    /**
     * 解析排除用户列表
     * @param excludeUsersStr 排除用户字符串（逗号分隔）
     * @returns 用户ID数组
     */
    parseExcludeUsers(excludeUsersStr: string): number[] {
        if (!excludeUsersStr || typeof excludeUsersStr !== 'string') {
            return [];
        }
        // 限制最大处理长度，防止正则表达式拒绝服务攻击
        const MAX_LENGTH = 10000;
        if (excludeUsersStr.length > MAX_LENGTH) {
            this.log('warn', `[今日老婆] 排除用户列表过长，已截断至 ${MAX_LENGTH} 字符`);
            excludeUsersStr = excludeUsersStr.substring(0, MAX_LENGTH);
        }
        
        return excludeUsersStr
            .split(',')
            .map(id => id.trim())
            .filter(id => {
                // 验证是否为有效的QQ号（5-12位数字）
                if (!id) return false;
                const numId = Number(id);
                return /^\d{5,12}$/.test(id) && !isNaN(numId) && numId > 0;
            })
            .map(id => parseInt(id, 10));
    }

    /**
     * 设置配置
     * @param newConfig 新配置
     */
    setConfig(newConfig: Partial<PluginConfig> & { excludeUsers?: string | number[] }): void {
        const processedConfig: Partial<PluginConfig> = { ...newConfig };
        
        // 处理 excludeUsers 字段，支持字符串或数组
        if (newConfig.excludeUsers !== undefined) {
            if (typeof newConfig.excludeUsers === 'string') {
                processedConfig.excludeUsers = this.parseExcludeUsers(newConfig.excludeUsers);
            } else if (Array.isArray(newConfig.excludeUsers)) {
                processedConfig.excludeUsers = newConfig.excludeUsers.filter(id => typeof id === 'number');
            }
        }
        
        this.config = { ...this.config, ...processedConfig };
    }

    /**
     * 获取机器人QQ号
     * @returns 机器人QQ号或null
     */
    async getBotUin(): Promise<number | null> {
        if (!this.ctx) return null;
        try {
            const response = await this.ctx.actions.call(
                'get_login_info',
                void 0,
                this.ctx.adapterName,
                this.ctx.pluginManager.config
            ) as { data?: { user_id: number } };
            return response?.data?.user_id || null;
        } catch (error) {
            this.log('warn', '[今日老婆] 获取机器人信息失败:', error);
            return null;
        }
    }

    /**
     * 检查冷却时间
     * @param groupId 群号
     * @param userId 用户ID
     * @returns 是否在冷却中
     */
    isInCooldown(groupId: number, userId: number): boolean {
        const key = `${groupId}:${userId}`;
        const lastTime = this.cooldownMap.get(key);
        
        // 如果没有记录或冷却时间为0，则不在冷却中
        if (lastTime === undefined || this.config.cooldown <= 0) {
            return false;
        }
        
        const now = Date.now();
        return (now - lastTime) < this.config.cooldown;
    }

    /**
     * 设置冷却时间
     * @param groupId 群号
     * @param userId 用户ID
     */
    setCooldown(groupId: number, userId: number): void {
        const key = `${groupId}:${userId}`;
        this.cooldownMap.set(key, Date.now());
    }

    /**
     * 获取今日老婆记录
     * @param groupId 群号
     * @param userId 用户ID
     */
    getTodayWife(groupId: number, userId: number): TodayWifeRecord | undefined {
        const key = `${groupId}:${userId}`;
        const record = this.todayWifeRecords.get(key);
        if (record && this.isSameDay(record.timestamp, Date.now())) {
            return record;
        }
        return undefined;
    }

    /**
     * 设置今日老婆记录
     * @param groupId 群号
     * @param userId 用户ID
     * @param wifeId 老婆ID
     * @param wifeName 老婆昵称
     */
    setTodayWife(groupId: number, userId: number, wifeId: number, wifeName: string): void {
        const key = `${groupId}:${userId}`;
        
        // 限制 Map 大小，防止内存无限增长（保留最近10000条记录）
        const MAX_RECORDS = 10000;
        if (this.todayWifeRecords.size >= MAX_RECORDS) {
            // 删除最旧的记录
            const firstKey = this.todayWifeRecords.keys().next().value;
            if (firstKey !== undefined) {
                this.todayWifeRecords.delete(firstKey);
            }
        }
        
        this.todayWifeRecords.set(key, {
            userId,
            wifeId,
            wifeName,
            timestamp: Date.now(),
            groupId
        });
    }

    /**
     * 检查是否同一天
     * @param timestamp1 时间戳1
     * @param timestamp2 时间戳2
     */
    private isSameDay(timestamp1: number, timestamp2: number): boolean {
        const date1 = new Date(timestamp1);
        const date2 = new Date(timestamp2);
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    /**
     * 记录日志
     * @param level 日志级别
     * @param message 消息
     * @param args 附加参数
     */
    log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: unknown[]): void {
        if (!this.ctx) return;
        const logger = this.ctx.logger;
        switch (level) {
            case 'info':
                logger.info(message, ...args);
                break;
            case 'warn':
                logger.warn(message, ...args);
                break;
            case 'error':
                logger.error(message, ...args);
                break;
            case 'debug':
                logger.debug(message, ...args);
                break;
        }
    }
}

/**
 * 全局状态实例
 */
const pluginState = new PluginState();

/**
 * 插件初始化
 * @param ctx 插件上下文对象
 */
export const plugin_init = async (ctx: NapCatPluginContext): Promise<void> => {
    pluginState.init(ctx);
    
    // 尝试从配置文件加载配置
    try {
        const configPath = ctx.configPath;
        if (configPath) {
            // 使用动态导入 fs 模块 - 在 Node.js 环境中运行
            const fs = await import('fs');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf-8');
                const savedConfig = JSON.parse(configData);
                
                // 验证配置对象的有效性
                if (savedConfig && typeof savedConfig === 'object') {
                    pluginState.setConfig(savedConfig);
                    pluginState.log('info', '[今日老婆] 已从配置文件加载配置');
                } else {
                    pluginState.log('warn', '[今日老婆] 配置文件格式无效，使用默认配置');
                }
            }
        }
    } catch (error) {
        pluginState.log('warn', '[今日老婆] 加载配置文件失败，使用默认配置:', error);
    }
    
    pluginState.log('info', '[今日老婆] 插件初始化完成');
};

/**
 * 消息事件处理
 * @param ctx 插件上下文对象
 * @param event 消息事件
 */
export const plugin_onmessage = async (ctx: NapCatPluginContext, event: MessageEvent): Promise<void> => {
    if (!pluginState.getConfig().enabled) {
        return;
    }

    if (event.message_type !== 'group') {
        return;
    }

    const config = pluginState.getConfig();
    const rawMessage = event.raw_message.trim();
    
    if (!rawMessage.includes(config.keyword)) {
        return;
    }

    if (pluginState.isInCooldown(event.group_id, event.user_id)) {
        pluginState.log('debug', `[今日老婆] 用户 ${event.user_id} 在冷却中`);
        return;
    }

    try {
        await handleTodayWife(ctx, event);
        // 只有在成功处理后才设置冷却时间
        pluginState.setCooldown(event.group_id, event.user_id);
    } catch (error) {
        // 详细的错误日志记录
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        pluginState.log('error', `[今日老婆] 处理消息时发生错误: ${errorMessage}`);
        if (errorStack) {
            pluginState.log('debug', `[今日老婆] 错误堆栈: ${errorStack}`);
        }
        
        // 向用户发送友好的错误提示
        try {
            await sendErrorMessage(ctx, event, '处理请求时发生错误，请稍后重试');
        } catch (sendError) {
            pluginState.log('error', '[今日老婆] 发送错误消息失败:', sendError);
        }
    }
};

/**
 * 插件清理
 * @param ctx 插件上下文对象
 */
export const plugin_cleanup = async (ctx: NapCatPluginContext): Promise<void> => {
    pluginState.stopCleanupTimer();
    pluginState.log('info', '[今日老婆] 插件已卸载');
};

/**
 * 配置变更回调
 * @param ctx 插件上下文对象
 * @param newConfig 新配置
 */
export const plugin_on_config_change = (ctx: NapCatPluginContext, newConfig: Partial<PluginConfig> & { excludeUsers?: string | number[] }): void => {
    // 直接调用 setConfig 处理配置更新，避免重复解析 excludeUsers
    pluginState.setConfig(newConfig);
    pluginState.log('info', '[今日老婆] 配置已更新');
};

/**
 * 获取配置 Schema
 * @param ctx 插件上下文对象
 */
export const plugin_config_ui = (ctx: NapCatPluginContext): unknown => {
    return ctx.NapCatConfig.combine(
        ctx.NapCatConfig.boolean('enabled', '启用插件', true, '是否启用今日老婆功能'),
        ctx.NapCatConfig.text('keyword', '触发关键词', '今日老婆', '触发抽取的关键词'),
        ctx.NapCatConfig.number('cooldown', '冷却时间(毫秒)', 30000, '同一用户两次触发的最小间隔'),
        ctx.NapCatConfig.boolean('excludeBot', '排除机器人', true, '是否排除机器人账号'),
        ctx.NapCatConfig.text('excludeUsers', '排除用户(逗号分隔)', '', '排除的用户ID，用逗号分隔')
    );
};

/**
 * 获取配置
 */
export const plugin_get_config = (): PluginConfig => {
    return pluginState.getConfig();
};

/**
 * 设置配置
 * @param ctx 插件上下文对象
 * @param config 配置对象
 */
export const plugin_set_config = (ctx: NapCatPluginContext, config: Partial<PluginConfig> & { excludeUsers?: string | number[] }): void => {
    pluginState.setConfig(config);
};

/**
 * 处理今日老婆逻辑
 * @param ctx 插件上下文对象
 * @param event 消息事件
 */
async function handleTodayWife(ctx: NapCatPluginContext, event: MessageEvent): Promise<void> {
    const groupId = event.group_id;
    const userId = event.user_id;
    const config = pluginState.getConfig();

    const existingRecord = pluginState.getTodayWife(groupId, userId);
    if (existingRecord) {
        await sendTodayWifeMessage(ctx, event, existingRecord.wifeId, existingRecord.wifeName, true);
        return;
    }

    const members = await getGroupMembers(ctx, groupId);
    if (!members || members.length === 0) {
        await sendErrorMessage(ctx, event, '获取群成员列表失败，请稍后重试');
        return;
    }

    const botUin = await pluginState.getBotUin();
    const filteredMembers = filterMembers(members, config, userId, botUin);
    if (filteredMembers.length === 0) {
        await sendErrorMessage(ctx, event, '没有可抽取的群成员');
        return;
    }

    const selectedMember = selectRandomMember(filteredMembers);
    const wifeName = selectedMember.card || selectedMember.nickname;

    pluginState.setTodayWife(groupId, userId, selectedMember.user_id, wifeName);

    pluginState.log('info', `[今日老婆] 群 ${groupId} 用户 ${userId} 抽取到 ${selectedMember.user_id}(${wifeName})`);

    await sendTodayWifeMessage(ctx, event, selectedMember.user_id, wifeName, false);
}

/**
 * 获取群成员列表
 * @param ctx 插件上下文对象
 * @param groupId 群号
 */
async function getGroupMembers(ctx: NapCatPluginContext, groupId: number): Promise<GroupMember[]> {
    try {
        const response = await ctx.actions.call(
            'get_group_member_list',
            { group_id: groupId },
            ctx.adapterName,
            ctx.pluginManager.config
        ) as { data?: GroupMember[] | { [key: number]: GroupMember } };

        if (!response || !response.data) {
            pluginState.log('warn', '[今日老婆] 获取群成员列表响应为空');
            return [];
        }

        if (Array.isArray(response.data)) {
            return response.data;
        }

        return Object.values(response.data);
    } catch (error) {
        pluginState.log('error', '[今日老婆] 获取群成员列表失败:', error);
        return [];
    }
}

/**
 * 过滤群成员
 * @param members 群成员列表
 * @param config 插件配置
 * @param senderId 发送者ID
 * @param botUin 机器人QQ号
 * @returns 过滤后的群成员列表
 */
function filterMembers(members: GroupMember[], config: PluginConfig, senderId: number, botUin: number | null): GroupMember[] {
    // 如果成员列表为空，直接返回空数组
    if (!members || members.length === 0) {
        return [];
    }

    let filtered = members.filter(member => {
        // 排除发送者自己
        if (member.user_id === senderId) {
            return false;
        }

        // 排除机器人（如果配置启用）
        if (config.excludeBot && botUin && member.user_id === botUin) {
            return false;
        }

        // 排除指定用户
        if (config.excludeUsers && Array.isArray(config.excludeUsers) && config.excludeUsers.length > 0) {
            if (config.excludeUsers.includes(member.user_id)) {
                return false;
            }
        }

        return true;
    });

    return filtered;
}

/**
 * 随机选择群成员
 * 使用简单的随机索引选择，性能优于 Fisher-Yates 洗牌算法
 * @param members 群成员列表
 * @throws 当成员列表为空时抛出错误
 */
function selectRandomMember(members: GroupMember[]): GroupMember {
    if (!members || members.length === 0) {
        throw new Error('成员列表不能为空');
    }
    
    // 直接生成随机索引，时间复杂度 O(1)，优于 Fisher-Yates 的 O(n)
    const randomIndex = Math.floor(Math.random() * members.length);
    return members[randomIndex];
}

/**
 * 发送今日老婆消息
 * @param ctx 插件上下文对象
 * @param event 消息事件
 * @param wifeId 老婆ID
 * @param wifeName 老婆昵称
 * @param isExisting 是否是已存在的记录
 */
async function sendTodayWifeMessage(
    ctx: NapCatPluginContext, 
    event: MessageEvent, 
    wifeId: number, 
    wifeName: string,
    isExisting: boolean
): Promise<void> {
    try {
        const messages: MessageSegment[] = [];

        messages.push({
            type: 'at',
            data: { qq: String(event.user_id) }
        });

        let textContent = isExisting 
            ? ` 你今天已经抽过老婆了！你的老婆依然是 @${wifeName}`
            : ` 今天你的老婆是 @${wifeName}`;
        
        messages.push({
            type: 'text',
            data: { text: textContent }
        });

        const avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${wifeId}&s=640`;
        messages.push({
            type: 'image',
            data: { file: avatarUrl }
        });

        await ctx.actions.call(
            'send_msg',
            {
                message_type: 'group',
                group_id: event.group_id,
                message: messages
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
    } catch (error) {
        pluginState.log('error', '[今日老婆] 发送消息失败:', error);
        throw error; // 向上抛出，让调用者处理
    }
}

/**
 * 发送错误消息
 * @param ctx 插件上下文对象
 * @param event 消息事件
 * @param errorMsg 错误信息
 */
async function sendErrorMessage(ctx: NapCatPluginContext, event: MessageEvent, errorMsg: string): Promise<void> {
    try {
        const messages: MessageSegment[] = [
            {
                type: 'at',
                data: { qq: String(event.user_id) }
            },
            {
                type: 'text',
                data: { text: ` ${errorMsg}` }
            }
        ];

        await ctx.actions.call(
            'send_msg',
            {
                message_type: 'group',
                group_id: event.group_id,
                message: messages
            },
            ctx.adapterName,
            ctx.pluginManager.config
        );
    } catch (error) {
        // 记录错误但不抛出，避免错误消息发送失败导致循环错误
        pluginState.log('error', '[今日老婆] 发送错误消息失败:', error);
    }
}
