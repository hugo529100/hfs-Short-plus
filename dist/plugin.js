exports.repo = "Hug3O/Short-plus"
exports.version = 1
exports.description = "Enhanced file sorting with tile mode memory"
exports.apiRequired = 9.6
exports.frontend_js = "main.js"

exports.config = {
    enableTileModeMemory: {
        label: "Enable Tile Mode Memory",
        type: "boolean",
        default: true,
        helper: "When disabled, tile mode settings per folder will not be remembered"
    },
    expireHours: {
        label: "Memory Expiration (hours)",
        type: "number",
        min: 0,
        max: 8760,
        default: 24,
        helper: "Records older than this will be removed. Set to 0 for no expiration."
    }
}