/**
 * 今日老婆插件 - 入口文件
 * 导出所有插件生命周期函数和配置
 */

export {
    plugin_init,
    plugin_onmessage,
    plugin_cleanup,
    plugin_on_config_change,
    plugin_config_ui,
    plugin_get_config,
    plugin_set_config
} from './dist/index.js';
