Module.register("MMM-EcoHarmonogram", {
	defaults: {
		// --- adres (wymagane: town, number; street dla miejscowości z ulicami) ---
		town: "",
		district: "", // gmina, gdy jest kilka miejscowości o tej samej nazwie
		street: "",
		number: "",
		sides: "", // wariant harmonogramu, np. "Zabudowa jednorodzinna"
		region: "", // rejon w obrębie miejscowości
		groups: {}, // wybór grup harmonogramu, np. { g1: "Zabudowa jednorodzinna" }
		community: "", // identyfikator gminy w EcoHarmonogramie (rzadko potrzebny)
		app: null, // "customApp" dla gmin z własną aplikacją (np. "gdansk")
		language: "pl", // język nazw z API i dat: pl | en | uk | ru

		// --- wygląd ---
		maxDays: 1, // ile najbliższych dni z wywozem pokazać (1 = tylko najbliższy wywóz)
		daysAhead: 45, // jak daleko w przód szukać
		exclude: ["TERMIN PŁATNOŚCI"], // nazwy pozycji do pominięcia (bez rozróżniania wielkości liter)
		dateFormat: "dd D MMM", // format moment.js dla dalszych dat
		fade: true, // dalsze terminy stopniowo bledną
		useColors: true, // kolory z EcoHarmonogramu
		showIcons: true, // ikony Font Awesome; false = kolorowe kropki
		// fragment nazwy -> ikona Font Awesome; pierwsze dopasowanie wygrywa
		icons: {
			zmieszane: "fa-trash-can",
			bio: "fa-leaf",
			metal: "fa-bottle-water",
			tworzyw: "fa-bottle-water",
			szkło: "fa-wine-bottle",
			papier: "fa-newspaper",
			gabaryt: "fa-couch",
			elektro: "fa-plug",
			popiół: "fa-fire",
			choink: "fa-tree",
			zielon: "fa-seedling",
			płatno: "fa-money-bill"
		},
		defaultIcon: "fa-recycle",

		// --- odświeżanie ---
		updateInterval: 6 * 60 * 60 * 1000,
		animationSpeed: 1000
	},

	// pozwala w config.js dopisać pojedyncze ikony bez kopiowania całej mapy
	configDeepMerge: true,

	getStyles () {
		return ["MMM-EcoHarmonogram.css"];
	},

	getScripts () {
		return ["moment.js"];
	},

	getTranslations () {
		return {
			pl: "translations/pl.json",
			en: "translations/en.json",
			uk: "translations/uk.json"
		};
	},

	start () {
		this.collections = null;
		this.error = null;
		this.sendSocketNotification("ECOHARMONOGRAM_CONFIG", { identifier: this.identifier, config: this.config });
		// odświeżanie widoku o północy (Dziś/Jutro)
		this.scheduleMidnightRefresh();
	},

	scheduleMidnightRefresh () {
		const msToMidnight = moment().endOf("day").diff(moment()) + 1000;
		setTimeout(() => {
			this.updateDom(this.config.animationSpeed);
			this.scheduleMidnightRefresh();
		}, msToMidnight);
	},

	socketNotificationReceived (notification, payload) {
		if (payload.identifier !== this.identifier) return;
		if (notification === "ECOHARMONOGRAM_DATA") {
			this.collections = payload.collections;
			this.error = null;
		} else if (notification === "ECOHARMONOGRAM_ERROR") {
			this.error = payload.error;
		}
		this.updateDom(this.config.animationSpeed);
	},

	upcomingDays () {
		const today = moment().startOf("day");
		const limit = moment(today).add(this.config.daysAhead, "days");
		const exclude = this.config.exclude.map((e) => e.toLowerCase());
		const byDate = new Map();
		for (const c of this.collections || []) {
			const date = moment(c.date, "YYYY-MM-DD");
			if (date.isBefore(today) || date.isAfter(limit)) continue;
			if (exclude.includes(c.name.toLowerCase())) continue;
			if (!byDate.has(c.date)) byDate.set(c.date, []);
			byDate.get(c.date).push(c);
		}
		const maxDays = Math.max(1, Math.floor(Number(this.config.maxDays)) || 1);
		return [...byDate.entries()].slice(0, maxDays);
	},

	formatDay (dateStr) {
		const date = moment(dateStr, "YYYY-MM-DD");
		const diff = date.diff(moment().startOf("day"), "days");
		if (diff === 0) return this.translate("TODAY");
		if (diff === 1) return this.translate("TOMORROW");
		return date.locale(this.config.language).format(this.config.dateFormat);
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-ecoharmonogram small";

		if (this.error && !this.collections) {
			wrapper.textContent = `${this.translate("ERROR")}: ${this.error}`;
			wrapper.classList.add("dimmed");
			return wrapper;
		}
		if (!this.collections) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.classList.add("dimmed", "light");
			return wrapper;
		}

		const days = this.upcomingDays();
		if (!days.length) {
			wrapper.innerHTML = this.translate("NO_COLLECTIONS");
			wrapper.classList.add("dimmed");
			return wrapper;
		}

		const table = document.createElement("table");
		days.forEach(([date, items], index) => {
			const row = document.createElement("tr");
			const diff = moment(date, "YYYY-MM-DD").diff(moment().startOf("day"), "days");
			if (diff <= 1) row.classList.add("bright", "soon");
			if (this.config.fade && index > 0 && diff > 1) row.style.opacity = Math.max(0.4, 1 - index * 0.12);

			const dayCell = document.createElement("td");
			dayCell.className = "day";
			dayCell.textContent = this.formatDay(date);
			row.appendChild(dayCell);

			const typesCell = document.createElement("td");
			typesCell.className = "types";
			for (const item of items) {
				const tag = document.createElement("span");
				tag.className = "type";
				if (this.config.showIcons) {
					const icon = document.createElement("i");
					icon.className = `icon fa-solid fa-fw ${this.iconFor(item.name)}`;
					if (this.config.useColors && item.color) icon.style.color = this.visibleColor(item.color);
					tag.appendChild(icon);
				} else if (this.config.useColors && item.color) {
					const dot = document.createElement("span");
					dot.className = "dot";
					dot.style.backgroundColor = item.color;
					tag.appendChild(dot);
				}
				tag.appendChild(document.createTextNode(this.prettyName(item.name)));
				typesCell.appendChild(tag);
			}
			row.appendChild(typesCell);
			table.appendChild(row);
		});
		wrapper.appendChild(table);
		return wrapper;
	},

	iconFor (name) {
		const lower = name.toLocaleLowerCase("pl");
		const match = Object.entries(this.config.icons).find(([key]) => lower.includes(key.toLocaleLowerCase("pl")));
		return match ? match[1] : this.config.defaultIcon;
	},

	visibleColor (hex) {
		// bardzo ciemne kolory (np. #413939 dla zmieszanych) są niewidoczne na czarnym tle
		const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
		if (!m) return hex;
		const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b < 90 ? "#9a9a9a" : hex;
	},

	prettyName (name) {
		// "METALE I TWORZYWA SZTUCZNE" -> "Metale i tworzywa sztuczne"
		const lower = name.toLocaleLowerCase("pl");
		return lower.charAt(0).toLocaleUpperCase("pl") + lower.slice(1);
	}
});
