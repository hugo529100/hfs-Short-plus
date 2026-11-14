exports.repo = "Hug3O/Short-plus"
exports.version = 1.8
exports.description = "Improves sorted views by showing time or extension instead of size; also remembers tile size per folder"
exports.apiRequired = 9.6
exports.frontend_js = "main.js"

exports.config = {
    enableEnhancedSorting: {
        label: "Enable Enhanced Sorting UI",
        type: "boolean",
        default: true,
        helperText: "Core feature. When enabled, the size column is replaced with time / extension info based on the current sort. Disable to keep the native interface."
    },
    enableTileModeMemory: {
        label: "Enable Tile Mode Memory",
        type: "boolean",
        default: true,
        helperText: "When disabled, tile mode settings per folder will not be remembered"
    },
    expireHours: {
        label: "Memory Expiration (hours)",
        type: "number",
        min: 0,
        max: 8760,
        default: 24,
        helperText: "Records older than this will be removed. Set to 0 for no expiration."
    }
}

exports.init = (api) => {
    // Respect the backend switch: if tile memory is disabled, do nothing at all.
    // This prevents the plugin from reading the YAML tile_size setting or
    // injecting serverTileSize into the frontend config.
    let tileMemoryEnabled = true;
    try {
        const cfg = api.getPluginConfig ? api.getPluginConfig() : null;
        if (cfg && cfg.enableTileModeMemory === false) {
            tileMemoryEnabled = false;
        }
    } catch (e) {}

    if (!tileMemoryEnabled) {
        // Explicitly clear any previously injected value so a stale config
        // from a previous run cannot linger.
        try {
            if (api.setPluginConfig) {
                api.setPluginConfig('serverTileSize', undefined);
            }
        } catch (e) {}
        return;
    }

    let serverTileSize;

    try {
        const hfsConfig = api.getHfsConfig();
        if (hfsConfig?.tile_size !== undefined) {
            const parsed = parseInt(hfsConfig.tile_size);
            if (!isNaN(parsed) && parsed > 0) {
                serverTileSize = parsed;
            }
        }
    } catch (e) {}

    if (api.setPluginConfig) {
        api.setPluginConfig('serverTileSize', serverTileSize);
    }
}