const NodeHelper = require("node_helper");
const Log = require("logger");
const { EcoHarmonogram } = require("./lib/ecoharmonogram");

const RETRY_AFTER_ERROR = 15 * 60 * 1000;

module.exports = NodeHelper.create({
	start () {
		Log.log(`Starting node helper for: ${this.name}`);
		this.timers = {};
	},

	stop () {
		Object.values(this.timers).forEach(clearTimeout);
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "ECOHARMONOGRAM_CONFIG") return;
		const { identifier, config } = payload;
		clearTimeout(this.timers[identifier]);
		this.fetchCollections(identifier, config);
	},

	async fetchCollections (identifier, config) {
		let delay = config.updateInterval;
		try {
			const client = new EcoHarmonogram({ app: config.app, language: config.language });
			const collections = await client.getCollections(config);
			this.sendSocketNotification("ECOHARMONOGRAM_DATA", { identifier, collections });
		} catch (error) {
			Log.error(`${this.name}: ${error.message}`);
			this.sendSocketNotification("ECOHARMONOGRAM_ERROR", { identifier, error: error.message });
			// błąd konfiguracji nie zniknie sam, błąd sieci ponawiamy szybciej
			if (error.name !== "ConfigError") delay = Math.min(delay, RETRY_AFTER_ERROR);
		}
		this.timers[identifier] = setTimeout(() => this.fetchCollections(identifier, config), delay);
	}
});
