/**
 * NapCat 插件类型定义
 * 包含插件开发所需的核心类型接口
 */

/**
 * 消息段类型 - 文本消息
 */
export interface MessageSegmentText {
    type: 'text';
    data: {
        text: string;
    };
}

/**
 * 消息段类型 - @消息
 */
export interface MessageSegmentAt {
    type: 'at';
    data: {
        qq: string;
        name?: string;
    };
}

/**
 * 消息段类型 - 图片消息
 */
export interface MessageSegmentImage {
    type: 'image';
    data: {
        file: string;
        url?: string;
    };
}

/**
 * 消息段类型 - 回复消息
 */
export interface MessageSegmentReply {
    type: 'reply';
    data: {
        id: string | number;
    };
}

/**
 * 消息段联合类型
 */
export type MessageSegment = MessageSegmentText | MessageSegmentAt | MessageSegmentImage | MessageSegmentReply;

/**
 * 群成员信息
 */
export interface GroupMember {
    user_id: number;
    nickname: string;
    card?: string;
    role?: 'owner' | 'admin' | 'member';
}

/**
 * 消息事件对象
 */
export interface MessageEvent {
    message_id: number;
    user_id: number;
    group_id: number;
    message_type: 'private' | 'group';
    raw_message: string;
    message: MessageSegment[];
    sender: {
        user_id: number;
        nickname: string;
        card?: string;
    };
    time: number;
}

/**
 * 插件上下文对象
 */
export interface NapCatPluginContext {
    core: unknown;
    oneBot: unknown;
    actions: {
        call: (actionName: string, params: unknown, adapterName: string, config: unknown) => Promise<unknown>;
    };
    pluginName: string;
    pluginPath: string;
    configPath: string;
    dataPath: string;
    adapterName: string;
    pluginManager: {
        config: unknown;
    };
    logger: {
        log: (...args: unknown[]) => void;
        debug: (...args: unknown[]) => void;
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
    router: {
        page: (definition: unknown) => void;
        get: (path: string, handler: unknown) => void;
        post: (path: string, handler: unknown) => void;
        getNoAuth: (path: string, handler: unknown) => void;
        postNoAuth: (path: string, handler: unknown) => void;
    };
    NapCatConfig: {
        boolean: (key: string, label: string, defaultValue: boolean, description?: string) => unknown;
        text: (key: string, label: string, defaultValue: string, description?: string) => unknown;
        number: (key: string, label: string, defaultValue: number, description?: string) => unknown;
        combine: (...items: unknown[]) => unknown;
    };
}

/**
 * 插件配置
 */
export interface PluginConfig {
    enabled: boolean;
    keyword: string;
    cooldown: number;
    excludeBot: boolean;
    excludeUsers: number[];
}

/**
 * API 响应基础结构
 */
export interface ApiResponse<T = unknown> {
    status: string;
    retcode: number;
    data: T;
    message?: string;
}

/**
 * 登录信息响应
 */
export interface LoginInfoData {
    user_id: number;
    nickname: string;
}

/**
 * 群成员列表响应数据
 */
export interface GroupMemberListData {
    [index: number]: GroupMember;
}

/**
 * 获取群成员信息响应数据
 */
export interface GroupMemberInfoData extends GroupMember {}

/**
 * 获取群信息响应数据
 */
export interface GroupInfoData {
    group_id: number;
    group_name: string;
    member_count: number;
}

/**
 * 发送消息参数
 */
export interface SendMsgParams {
    message_type: 'private' | 'group';
    group_id?: number;
    user_id?: number;
    message: MessageSegment[];
}

/**
 * 获取群成员列表参数
 */
export interface GetGroupMemberListParams {
    group_id: number;
}

/**
 * 今日老婆记录
 */
export interface TodayWifeRecord {
    userId: number;
    wifeId: number;
    wifeName: string;
    timestamp: number;
    groupId: number;
}
