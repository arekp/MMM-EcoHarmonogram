const { test, describe } = require("node:test");
const assert = require("node:assert");
const { EcoHarmonogram, ConfigError, parseSchedules, filterByHouseNumber } = require("../lib/ecoharmonogram");
const fixtures = require("./fixtures");

const NOW = new Date("2026-10-04T12:00:00Z");
const ROLNICZA = { town: "Pruszków", district: "Pruszków", street: "Rolnicza", number: "18" };

/** Atrapa fetch: `routes[action]` to obiekt albo funkcja (params) => obiekt. */
function mockClient (routes, calls = []) {
	const fetchImpl = async (url, opts) => {
		const params = Object.fromEntries(new URLSearchParams(opts.body));
		calls.push(params);
		const route = routes[params.action];
		if (route === undefined) throw new Error(`unexpected action ${params.action}`);
		const body = typeof route === "function" ? route(params) : route;
		return { ok: true, status: 200, text: async () => `\uFEFF${JSON.stringify(body)}` };
	};
	return new EcoHarmonogram({ fetchImpl });
}

const scheduleFor = (name, days = "7") => ({
	schedules: [{ month: "10", days, year: "2026", scheduleDescriptionId: "1" }],
	scheduleDescription: [{ id: "1", name, color: "#000000", doNotShowDates: "0" }],
	street: { sides: "" }
});

describe("getCollections", () => {
	test("Pruszków, Rolnicza 18 (prawdziwe odpowiedzi API)", async () => {
		const calls = [];
		const events = await mockClient(fixtures, calls).getCollections(ROLNICZA, NOW);

		assert.deepStrictEqual(calls.map((c) => c.action), ["getTowns", "getSchedulePeriods", "getStreets", "getSchedules"]);
		assert.strictEqual(calls[1].townId, "3964", "wybiera Pruszków mazowiecki, nie Bliżanów");
		assert.strictEqual(calls[3].streetId, "27577836");

		const on = (date) => events.filter((e) => e.date === date).map((e) => e.name);
		assert.deepStrictEqual(on("2026-10-07"), ["METALE I TWORZYWA SZTUCZNE", "PAPIER", "SZKŁO"]);
		assert.deepStrictEqual(on("2026-10-08"), ["BIO", "ODPADY ZMIESZANE"]);
		assert.ok(on("2026-10-01").includes("BIO"), "dni jednocyfrowe są dopełniane zerem");
		assert.strictEqual(events.length, 14);
	});

	test("pomija okresy, które już się skończyły", async () => {
		const calls = [];
		const routes = {
			...fixtures,
			getSchedulePeriods: { schedulePeriods: [
				{ id: "old", startDate: "2025-01-01", endDate: "2025-12-31" },
				{ id: "10536", startDate: "2026-01-01", endDate: "2026-12-31" }
			] }
		};
		await mockClient(routes, calls).getCollections(ROLNICZA, NOW);
		assert.ok(calls.filter((c) => c.schedulePeriodId).every((c) => c.schedulePeriodId === "10536"));
	});

	test("łączy kolejne okresy (np. przełom roku)", async () => {
		const routes = {
			...fixtures,
			getSchedulePeriods: { schedulePeriods: [{ id: "a", endDate: "2026-12-31" }, { id: "b", endDate: "2027-12-31" }] },
			getSchedules: (p) => (p.schedulePeriodId === "a" ? scheduleFor("PAPIER", "20") : { ...scheduleFor("BIO", "3"), schedules: [{ month: "1", days: "3", year: "2027", scheduleDescriptionId: "1" }] })
		};
		const events = await mockClient(routes).getCollections(ROLNICZA, NOW);
		assert.deepStrictEqual(events.map((e) => e.date), ["2026-10-20", "2027-01-03"]);
	});

	test("wymaga numeru domu", async () => {
		await assert.rejects(mockClient(fixtures).getCollections({ town: "Pruszków" }, NOW), (e) => e instanceof ConfigError && e.option === "number");
	});
});

describe("dopasowanie miejscowości", () => {
	test("nieznana miejscowość podaje listę podpowiedzi", async () => {
		await assert.rejects(mockClient(fixtures).getCollections({ town: "Warszawa", number: "1" }, NOW), (e) => {
			assert.strictEqual(e.option, "town");
			assert.ok(e.suggestions.includes("Pruszków"));
			return true;
		});
	});

	test("dwie miejscowości o tej samej nazwie wymagają gminy", async () => {
		await assert.rejects(mockClient(fixtures).getCollections({ town: "Pruszków", street: "Rolnicza", number: "18" }, NOW), (e) => {
			assert.strictEqual(e.option, "district");
			assert.deepStrictEqual(e.suggestions, ["Pruszków", "Bliżanów"]);
			return true;
		});
	});

	test("community używa getTownsForCommunity", async () => {
		const calls = [];
		const routes = { ...fixtures, getTownsForCommunity: { towns: [fixtures.getTowns.towns[1]] } };
		await mockClient(routes, calls).getCollections({ ...ROLNICZA, district: "", community: "180" }, NOW);
		assert.strictEqual(calls[0].action, "getTownsForCommunity");
		assert.strictEqual(calls[0].communityId, "180");
	});
});

describe("grupy i warianty", () => {
	const groupRoutes = {
		...fixtures,
		getStreets: (p) => (p.groupId === "1"
			? { streets: [], groups: { groupId: "g1", items: [{ name: "Zabudowa jednorodzinna", choosedStreetIds: "11" }, { name: "Firmy", choosedStreetIds: "12" }] } }
			: { streets: [{ id: p.choosedStreetIds, sides: "" }], groups: { groupId: "", items: [] } }),
		getSchedules: (p) => scheduleFor(p.streetId === "11" ? "DOM" : "FIRMA")
	};

	test("bez wybranej grupy zwraca listę grup", async () => {
		await assert.rejects(mockClient(groupRoutes).getCollections(ROLNICZA, NOW), (e) => {
			assert.strictEqual(e.option, "groups.g1");
			assert.deepStrictEqual(e.suggestions, ["Zabudowa jednorodzinna", "Firmy"]);
			return true;
		});
	});

	test("wybrana grupa przekazuje choosedStreetIds", async () => {
		const events = await mockClient(groupRoutes).getCollections({ ...ROLNICZA, groups: { g1: "zabudowa JEDNORODZINNA" } }, NOW);
		assert.deepStrictEqual(events.map((e) => e.name), ["DOM"]);
	});

	const sidesRoutes = {
		...fixtures,
		getStreets: { streets: [{ id: "1", sides: "Zabudowa jednorodzinna" }, { id: "2", sides: "Zabudowa wielorodzinna" }], groups: { items: [], groupId: "" } },
		getSchedules: (p) => ({ ...scheduleFor(p.streetId === "1" ? "JEDNO" : "WIELO"), street: { sides: p.streetId === "1" ? "Zabudowa jednorodzinna" : "Zabudowa wielorodzinna" } })
	};

	test("kilka wariantów ulicy wymaga opcji sides", async () => {
		await assert.rejects(mockClient(sidesRoutes).getCollections(ROLNICZA, NOW), (e) => e.option === "sides" && e.suggestions.length === 2);
	});

	test("sides wybiera właściwy harmonogram", async () => {
		const events = await mockClient(sidesRoutes).getCollections({ ...ROLNICZA, sides: "Zabudowa wielorodzinna" }, NOW);
		assert.deepStrictEqual(events.map((e) => e.name), ["WIELO"]);
	});

	test("jeden wpis z kilkoma id rozróżnia zabudowę po prefiksie nazwy (Hj/Hw)", async () => {
		const routes = {
			...fixtures,
			getStreets: { streets: [{ id: "1,2", sides: "" }], groups: { items: [], groupId: "" } },
			getSchedules: (p) => ({ ...scheduleFor(p.streetId === "1" ? "JEDNO" : "WIELO"), name: p.streetId === "1" ? "Hjb_15;X" : "Hwb_9;X" })
		};
		await assert.rejects(mockClient(routes).getCollections(ROLNICZA, NOW), (e) => e.option === "sides");
		const events = await mockClient(routes).getCollections({ ...ROLNICZA, sides: "Zabudowa jednorodzinna" }, NOW);
		assert.deepStrictEqual(events.map((e) => e.name), ["JEDNO"]);
	});
});

describe("parseSchedules", () => {
	test("pomija nieprawidłowe daty i pozycje ukryte", () => {
		const events = parseSchedules({
			schedules: [
				{ month: "11", days: "30;31", year: "2026", scheduleDescriptionId: "1" },
				{ month: "11", days: "5", year: "2026", scheduleDescriptionId: "2" }
			],
			scheduleDescription: [
				{ id: "1", name: " PAPIER ", color: "#3D8CBA", doNotShowDates: "0" },
				{ id: "2", name: "UKRYTE", doNotShowDates: "1" }
			]
		});
		assert.deepStrictEqual(events, [{ date: "2026-11-30", name: "PAPIER", color: "#3D8CBA" }]);
	});
});

describe("filterByHouseNumber", () => {
	const streets = [
		{ id: "a", numbers: "7/B", numberFrom: "", numberTo: "" },
		{ id: "b", numbers: "", numberFrom: "1", numberTo: "99" },
		{ id: "c", numbers: "", numberFrom: "100", numberTo: "" }
	];
	const ids = (n) => filterByHouseNumber(streets, n).map((s) => s.id);

	test("dokładny numer", () => assert.deepStrictEqual(ids("7/B"), ["a"]));
	test("zakres numerów", () => assert.deepStrictEqual(ids("18"), ["b"]));
	test("zakres otwarty z literą", () => assert.deepStrictEqual(ids("317E"), ["c"]));
});
