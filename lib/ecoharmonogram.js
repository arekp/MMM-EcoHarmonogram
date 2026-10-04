/**
 * Klient nieoficjalnego API ecoharmonogram.pl (to samo API, którego używa aplikacja mobilna EcoHarmonogram).
 *
 * Kolejność wywołań: getTowns → getSchedulePeriods → getStreets → getSchedules.
 * Logika dopasowania adresu jest wzorowana na źródle `ecoharmonogram_pl`
 * z projektu https://github.com/mampfes/hacs_waste_collection_schedule (MIT).
 */

const API_URL = "https://ecoharmonogram.pl/api/api.php";
const GROUP_KEYS = ["g1", "g2", "g3", "g4", "g5"];

class ConfigError extends Error {
	/**
	 * @param {string} option nazwa opcji konfiguracji, której dotyczy błąd
	 * @param {string} message opis
	 * @param {string[]} [suggestions] dostępne wartości
	 */
	constructor (option, message, suggestions = []) {
		const list = [...new Set(suggestions)].filter((s) => s !== undefined && s !== null);
		super(list.length ? `${message} Dostępne wartości "${option}": ${list.map((s) => `"${s}"`).join(", ")}` : message);
		this.name = "ConfigError";
		this.option = option;
		this.suggestions = list;
	}
}

const norm = (s) => String(s ?? "").trim().toLocaleLowerCase("pl");

function leadingNumber (value) {
	const m = /^\s*(\d+)/.exec(String(value ?? ""));
	return m ? Number(m[1]) : null;
}

/** Rozwija odpowiedź getSchedules do listy [{ date: "YYYY-MM-DD", name, color }]. */
function parseSchedules (response) {
	const descriptions = new Map((response.scheduleDescription || []).map((d) => [d.id, d]));
	const events = [];
	for (const s of response.schedules || []) {
		const desc = descriptions.get(s.scheduleDescriptionId);
		if (!desc || desc.doNotShowDates === "1") continue;
		for (const rawDay of String(s.days ?? "").split(";")) {
			const day = Number(rawDay.trim());
			const month = Number(s.month);
			const year = Number(s.year);
			if (!day || !month || !year) continue;
			const d = new Date(Date.UTC(year, month - 1, day));
			if (d.getUTCMonth() !== month - 1) continue; // nieprawidłowa data, np. 31 listopada
			events.push({
				date: d.toISOString().slice(0, 10),
				name: String(desc.name).trim(),
				color: desc.color || null
			});
		}
	}
	return events;
}

function dedupeAndSort (events) {
	const seen = new Set();
	return events
		.filter((e) => {
			const key = `${e.date}|${e.name}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pl"));
}

/** Zawęża ulice do tych pasujących do numeru domu (dokładnie, numberFrom albo zakres). */
function filterByHouseNumber (streets, number) {
	if (streets.length <= 1 || !number) return streets;
	const hn = String(number).trim();
	const exact = streets.filter((s) => String(s.numbers ?? "").trim() === hn);
	if (exact.length) return exact;
	const exactFrom = streets.filter((s) => String(s.numberFrom ?? "").trim() === hn);
	if (exactFrom.length) return exactFrom;
	const n = leadingNumber(hn);
	if (n !== null) {
		const range = streets.filter((s) => {
			const from = leadingNumber(s.numberFrom);
			const to = leadingNumber(s.numberTo);
			return from !== null && from <= n && (to === null || n <= to);
		});
		if (range.length) return range;
	}
	return streets;
}

// Niektóre miasta (np. Zabrze) rozróżniają zabudowę jedno- i wielorodzinną
// tylko prefiksem w polu `name` odpowiedzi getSchedules ("Hj..." / "Hw...").
function housingTypeLabel (response) {
	const m = /^H([jw])/.exec(String(response.name ?? "").split(";")[0]);
	if (!m) return "";
	return m[1] === "j" ? "Zabudowa jednorodzinna" : "Zabudowa wielorodzinna";
}

class EcoHarmonogram {
	/**
	 * @param {object} [options]
	 * @param {string|null} [options.app] wartość customApp (np. "gdansk"), dla większości gmin pusta
	 * @param {string} [options.language] pl | en | uk | ru
	 * @param {Function} [options.fetchImpl] implementacja fetch (do testów)
	 */
	constructor ({ app = null, language = "pl", fetchImpl = globalThis.fetch } = {}) {
		this.app = app || null;
		this.language = ["pl", "en", "uk", "ru"].includes(language) ? language : "pl";
		this.fetch = fetchImpl;
		this.clientId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
	}

	async request (action, payload = {}) {
		const params = new URLSearchParams({
			...payload,
			action,
			funcVersion: "3",
			appVersion: "107",
			systemId: "1",
			clientId: this.clientId,
			lng: this.language
		});
		if (this.app) params.set("customApp", this.app);

		const res = await this.fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"X-Requested-With": "XMLHttpRequest"
			},
			body: params.toString()
		});
		if (!res.ok) throw new Error(`EcoHarmonogram ${action}: HTTP ${res.status}`);
		const text = (await res.text()).replace(/^\uFEFF/, ""); // API zwraca UTF-8 z BOM
		try {
			return JSON.parse(text);
		} catch {
			throw new Error(`EcoHarmonogram ${action}: nieprawidłowa odpowiedź (${text.slice(0, 80)})`);
		}
	}

	async getTowns ({ town = "", community = "" } = {}) {
		const data = community
			? await this.request("getTownsForCommunity", { communityId: community })
			: await this.request("getTowns", { townName: town });
		return data.towns || [];
	}

	async findTown ({ town, district = "", community = "" }) {
		if (!town) throw new ConfigError("town", "Brak wymaganej opcji \"town\" (miejscowość).");
		const towns = await this.getTowns({ town, community });
		const byName = towns.filter((t) => norm(t.name).includes(norm(town)));
		if (!byName.length) {
			throw new ConfigError("town", `Nie znaleziono miejscowości "${town}".`, towns.map((t) => t.name));
		}
		const byDistrict = byName.filter((t) => norm(t.district).includes(norm(district)));
		if (!byDistrict.length) {
			throw new ConfigError("district", `Nie znaleziono gminy "${district}" dla "${town}".`, byName.map((t) => t.district));
		}
		if (byDistrict.length === 1) return byDistrict[0];

		const exact = byDistrict.filter((t) => norm(t.name) === norm(town) && (!district || norm(t.district) === norm(district)));
		if (exact.length === 1) return exact[0];
		throw new ConfigError(
			"district",
			`Jest kilka miejscowości pasujących do "${town}", podaj gminę.`,
			byDistrict.map((t) => t.district)
		);
	}

	async getSchedulePeriods (townId) {
		const { schedulePeriods = [] } = await this.request("getSchedulePeriods", { townId });
		return schedulePeriods;
	}

	/** Wywołuje getStreets, przechodząc przez kolejne pytania o grupy (g1..g5). */
	async getStreetsWithGroups ({ townId, periodId, street = "", number, groups = {} }) {
		let groupId = "1";
		let choosedStreetIds = "";
		let response;
		for (let i = 0; i < 6 && groupId !== ""; i++) {
			response = await this.request("getStreets", {
				townId,
				schedulePeriodId: periodId,
				streetName: street,
				number,
				groupId,
				choosedStreetIds
			});
			groupId = response.groups?.groupId ?? "";
			const items = response.groups?.items ?? [];
			if (!items.length || !GROUP_KEYS.includes(groupId)) continue;

			const wanted = groups[groupId];
			if (!wanted) {
				throw new ConfigError(`groups.${groupId}`, "Ten adres wymaga wybrania grupy harmonogramu.", items.map((g) => g.name));
			}
			const match = items.find((g) => norm(g.name) === norm(wanted));
			if (!match) {
				throw new ConfigError(`groups.${groupId}`, `Nie znaleziono grupy "${wanted}".`, items.map((g) => g.name));
			}
			choosedStreetIds = match.choosedStreetIds;
		}
		return response?.streets ?? [];
	}

	/** Zawęża listę ulic wg `sides` i `region` i numeru domu. */
	selectStreets (streets, { street, number, sides = "", region = "" }) {
		if (!streets.length) {
			throw new ConfigError("street", `Nie znaleziono ulicy "${street}" z numerem "${number}" w harmonogramie.`);
		}
		if (streets.length === 1) return streets;

		const regions = (list) => [...new Set(list.map((s) => String(s.region ?? "").trim()).filter(Boolean))].sort();
		const candidates = streets.filter((s) => {
			const sideOk = s.sides === "" || (sides !== "" && norm(s.sides) === norm(sides));
			if (!sideOk) return false;
			return region === "" || norm(s.region) === norm(region);
		});

		if (!candidates.length) {
			if (region) throw new ConfigError("region", `Nie znaleziono rejonu "${region}".`, regions(streets));
			if (sides) throw new ConfigError("sides", `Nie znaleziono wariantu "${sides}".`, streets.map((s) => s.sides));
			throw new ConfigError("sides", "Ta ulica ma kilka harmonogramów, wybierz wariant.", streets.map((s) => s.sides));
		}

		const byNumber = filterByHouseNumber(candidates, number);
		if (byNumber.length > 1 && !region) {
			const r = regions(byNumber);
			if (r.length > 1) throw new ConfigError("region", "Ten adres występuje w kilku rejonach, wybierz rejon.", r);
		}
		return byNumber;
	}

	async collectForStreet (street, periodId, sides) {
		const ids = String(street.id).split(",").filter(Boolean);
		const responses = [];
		for (const id of ids) responses.push(await this.request("getSchedules", { streetId: id, schedulePeriodId: periodId }));

		if (ids.length === 1) {
			return norm(responses[0].street?.sides).includes(norm(sides)) ? parseSchedules(responses[0]) : [];
		}

		// Kilka identyfikatorów dla jednej ulicy.
		const sideValues = new Set(responses.map((r) => norm(r.street?.sides)));
		if (sideValues.size > 1) {
			return responses.filter((r) => norm(r.street?.sides).includes(norm(sides))).flatMap(parseSchedules);
		}
		const labels = responses.map(housingTypeLabel);
		const distinct = [...new Set(labels.filter(Boolean))];
		if (distinct.length <= 1) return responses.flatMap(parseSchedules);
		if (!sides) throw new ConfigError("sides", "Ta ulica ma osobne harmonogramy dla zabudowy jedno- i wielorodzinnej.", distinct);
		const picked = responses.filter((r, i) => norm(labels[i]) === norm(sides));
		if (!picked.length) throw new ConfigError("sides", `Nie znaleziono wariantu "${sides}".`, distinct);
		return picked.flatMap(parseSchedules);
	}

	/**
	 * Zwraca posortowaną listę wywozów [{ date: "YYYY-MM-DD", name, color }]
	 * ze wszystkich okresów harmonogramu, które jeszcze się nie skończyły.
	 *
	 * @param {object} address
	 * @param {string} address.town miejscowość
	 * @param {string} [address.district] gmina
	 * @param {string} [address.community] identyfikator gminy w EcoHarmonogramie
	 * @param {string} [address.street] ulica (puste dla miejscowości bez ulic)
	 * @param {string} address.number numer domu
	 * @param {string} [address.sides] wariant harmonogramu, np. "Zabudowa jednorodzinna"
	 * @param {string} [address.region] rejon w obrębie miejscowości
	 * @param {object} [address.groups] wybór grup { g1: "...", g2: "..." }
	 * @param {Date} [now]
	 */
	async getCollections (address, now = new Date()) {
		const { number, sides = "", region = "", groups = {} } = address;
		if (!number) throw new ConfigError("number", "Brak wymaganej opcji \"number\" (numer domu).");

		const town = await this.findTown(address);
		const today = now.toISOString().slice(0, 10);
		const periods = (await this.getSchedulePeriods(town.id)).filter((p) => !p.endDate || p.endDate >= today);

		const events = [];
		for (const period of periods) {
			const streets = await this.getStreetsWithGroups({
				townId: town.id,
				periodId: period.id,
				street: address.street ?? "",
				number,
				groups
			});
			for (const street of this.selectStreets(streets, { street: address.street, number, sides, region })) {
				events.push(...await this.collectForStreet(street, period.id, sides));
			}
		}
		return dedupeAndSort(events);
	}
}

module.exports = { EcoHarmonogram, ConfigError, parseSchedules, filterByHouseNumber, API_URL };
